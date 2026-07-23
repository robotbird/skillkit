import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type {
  InstalledSkill,
  MarketSkill,
  Tool,
  InstallRecord,
  InstallRecordTarget,
  InstallRecordStatus,
  InstallRecordChannel,
} from '../shared/types.js';
import { deriveRecordErrorType } from './install-log.js';

let db: Database.Database;

export function initDb(): Database.Database {
  if (db) return db;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'skillkit.db');
  migrateLegacyDb(dir, file);
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) return initDb();
  return db;
}

/**
 * 一次性迁移：把旧版 skillzix 的 userData 目录里的数据库搬到新位置。
 * Electron 的 userData 目录随 package.json#name 变化（skillzix → skillkit），
 * 首次启动新版本时若新库不存在、旧库存在，则把旧库连同 WAL/SHM 一起拷过来。
 * 幂等；任何失败都吞掉并清理半成品，保证不会让应用起不来（最坏情况是空库重启）。
 */
function migrateLegacyDb(newDir: string, newFile: string): void {
  try {
    if (fs.existsSync(newFile)) return; // 已迁移过 / 已有新库
    const oldDir = path.resolve(newDir, '..', 'skillzix');
    const oldDb = path.join(oldDir, 'skillzix.db');
    if (!fs.existsSync(oldDb)) return; // 全新安装，无历史数据

    fs.copyFileSync(oldDb, newFile);
    const wal = oldDb + '-wal';
    const shm = oldDb + '-shm';
    if (fs.existsSync(wal)) fs.copyFileSync(wal, newFile + '-wal');
    if (fs.existsSync(shm)) fs.copyFileSync(shm, newFile + '-shm');
    console.log('[db] 已迁移旧版 skillzix.db → skillkit.db');
  } catch (e) {
    console.error('[db] 历史库迁移失败，将以空库启动：', e);
    // 清理可能写了一半的文件，避免下次打开一个损坏的库
    try { if (fs.existsSync(newFile)) fs.unlinkSync(newFile); } catch {}
    try { if (fs.existsSync(newFile + '-wal')) fs.unlinkSync(newFile + '-wal'); } catch {}
    try { if (fs.existsSync(newFile + '-shm')) fs.unlinkSync(newFile + '-shm'); } catch {}
  }
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS installed_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      path TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      size_bytes INTEGER,
      mtime INTEGER,
      source TEXT,
      installed_at INTEGER,
      UNIQUE (tool, name)
    );

    CREATE TABLE IF NOT EXISTS market_skills (
      slug TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      detail_fetched_at INTEGER,
      is_official INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT
    );

    -- 分享链接缓存：同一 (tool, name) 的分享复用，避免每次都重新打包上传。
    -- 这是一张独立表，**不会被 scanAll 清空**（installed_skills 才会被清空重建）。
    CREATE TABLE IF NOT EXISTS share_links (
      tool TEXT NOT NULL,
      name TEXT NOT NULL,
      share_id TEXT NOT NULL,
      url TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      mtime INTEGER,
      size_bytes INTEGER,
      PRIMARY KEY (tool, name)
    );

    -- 安装记录：成功/部分失败/全失败均落库，targets 存每个工具的成败与报错明细。
    -- 同样是独立表，**不会被 scanAll 清空**；写时裁剪到最近 200 条。
    CREATE TABLE IF NOT EXISTS install_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      channel TEXT NOT NULL,
      label TEXT NOT NULL,
      skill_name TEXT,
      status TEXT NOT NULL,
      error TEXT,
      targets TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_install_records_at ON install_records(at DESC);

    CREATE INDEX IF NOT EXISTS idx_market_owner ON market_skills(owner);
    CREATE INDEX IF NOT EXISTS idx_market_name ON market_skills(name);
  `);
  // install_records 是增量引入的表：早期构建可能缺 error 列，按需补上（已存在则跳过）。
  ensureColumn(d, 'install_records', 'error', 'TEXT');
}

/** 幂等加列：表已存在但缺某列时 ALTER 补上；列已存在则跳过。 */
function ensureColumn(d: Database.Database, table: string, column: string, type: string): void {
  const cols = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// ===== meta kv =====
export function metaGet(k: string): string | null {
  const row = getDb()
    .prepare('SELECT v FROM meta WHERE k = ?')
    .get(k) as { v: string } | undefined;
  return row?.v ?? null;
}

export function metaSet(k: string, v: string): void {
  getDb()
    .prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v')
    .run(k, v);
}

// ===== installed_skills =====
function rowToInstalled(r: any): InstalledSkill {
  return {
    tool: r.tool as Tool,
    name: r.name,
    description: r.description ?? null,
    path: r.path,
    isBuiltin: !!r.is_builtin,
    sizeBytes: r.size_bytes ?? null,
    mtime: r.mtime ?? null,
    source: r.source ?? null,
    installedAt: r.installed_at ?? null,
  };
}

export function upsertInstalled(s: InstalledSkill): void {
  getDb()
    .prepare(
      `INSERT INTO installed_skills (tool, name, description, path, is_builtin, size_bytes, mtime, source, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tool, name) DO UPDATE SET
         description=excluded.description,
         path=excluded.path,
         is_builtin=excluded.is_builtin,
         size_bytes=excluded.size_bytes,
         mtime=excluded.mtime,
         source=COALESCE(excluded.source, installed_skills.source),
         installed_at=COALESCE(installed_skills.installed_at, excluded.installed_at)`,
    )
    .run(
      s.tool,
      s.name,
      s.description,
      s.path,
      s.isBuiltin ? 1 : 0,
      s.sizeBytes,
      s.mtime,
      s.source,
      s.installedAt,
    );
}

export function deleteInstalledRow(tool: Tool, name: string): void {
  getDb().prepare('DELETE FROM installed_skills WHERE tool = ? AND name = ?').run(tool, name);
}

export function clearInstalled(): void {
  getDb().exec('DELETE FROM installed_skills');
}

/**
 * 删除扫描集之外的旧行（已从文件系统卸载、或 frontmatter name 变更）。
 * scanAll 不再整体清空，而是 merge-upsert 保留安装时写入的 source/installed_at（见 upsertInstalled 的 COALESCE），
 * 再用本函数清掉不再存在的行。activeKeys 为 `${tool}|${name}` 集合（tool 取自 Tool 枚举，不含 '|'，故无歧义）。
 */
export function deleteStaleInstalled(activeKeys: Set<string>): void {
  if (activeKeys.size === 0) {
    getDb().exec('DELETE FROM installed_skills');
    return;
  }
  const keys = Array.from(activeKeys);
  const placeholders = keys.map(() => '?').join(',');
  getDb()
    .prepare(`DELETE FROM installed_skills WHERE (tool || '|' || name) NOT IN (${placeholders})`)
    .run(...keys);
}

export function listInstalled(filter?: { tool?: Tool; q?: string }): InstalledSkill[] {
  const where: string[] = [];
  const params: any[] = [];
  if (filter?.tool) {
    where.push('tool = ?');
    params.push(filter.tool);
  }
  if (filter?.q) {
    where.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ?)');
    const like = `%${filter.q.toLowerCase()}%`;
    params.push(like, like);
  }
  const sql =
    'SELECT * FROM installed_skills' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY tool ASC, name ASC';
  return (getDb().prepare(sql).all(...params) as any[]).map(rowToInstalled);
}

// ===== market =====
function rowToMarket(r: any): MarketSkill {
  return {
    slug: r.slug,
    owner: r.owner,
    repo: r.repo,
    name: r.name,
    description: r.description ?? null,
    detailFetchedAt: r.detail_fetched_at ?? null,
    isOfficial: !!r.is_official,
  };
}

export function upsertMarketBatch(items: Omit<MarketSkill, 'detailFetchedAt'>[]): void {
  const insert = getDb().prepare(
    `INSERT INTO market_skills (slug, owner, repo, name, description, is_official)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       owner=excluded.owner,
       repo=excluded.repo,
       name=excluded.name,
       is_official=excluded.is_official`,
  );
  const tx = getDb().transaction((rows: typeof items) => {
    for (const it of rows) {
      insert.run(it.slug, it.owner, it.repo, it.name, it.description ?? null, it.isOfficial ? 1 : 0);
    }
  });
  tx(items);
}

export function updateMarketDescription(slug: string, description: string | null): void {
  getDb()
    .prepare(
      `UPDATE market_skills SET description = ?, detail_fetched_at = ? WHERE slug = ?`,
    )
    .run(description, Date.now(), slug);
}

export function getMarketBySlug(slug: string): MarketSkill | null {
  const r = getDb().prepare('SELECT * FROM market_skills WHERE slug = ?').get(slug) as any;
  return r ? rowToMarket(r) : null;
}

export function countMarket(filter?: { q?: string; owner?: string }): number {
  const where: string[] = [];
  const params: any[] = [];
  if (filter?.q) {
    where.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(owner) LIKE ?)');
    const like = `%${filter.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (filter?.owner) {
    where.push('owner = ?');
    params.push(filter.owner);
  }
  const sql = 'SELECT COUNT(*) AS c FROM market_skills' + (where.length ? ' WHERE ' + where.join(' AND ') : '');
  const r = getDb().prepare(sql).get(...params) as { c: number };
  return r.c;
}

// ===== share_links（分享链接缓存）=====
export interface ShareLinkRow {
  tool: Tool;
  name: string;
  shareId: string;
  url: string;
  expiresAt: number;
  createdAt: number;
  mtime: number | null;
  sizeBytes: number | null;
}

export function getShareLink(tool: Tool, name: string): ShareLinkRow | null {
  const r = getDb()
    .prepare('SELECT * FROM share_links WHERE tool = ? AND name = ?')
    .get(tool, name) as
    | {
        tool: string;
        name: string;
        share_id: string;
        url: string;
        expires_at: number;
        created_at: number;
        mtime: number | null;
        size_bytes: number | null;
      }
    | undefined;
  if (!r) return null;
  return {
    tool: r.tool as Tool,
    name: r.name,
    shareId: r.share_id,
    url: r.url,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    mtime: r.mtime ?? null,
    sizeBytes: r.size_bytes ?? null,
  };
}

export function upsertShareLink(row: ShareLinkRow): void {
  getDb()
    .prepare(
      `INSERT INTO share_links (tool, name, share_id, url, expires_at, created_at, mtime, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tool, name) DO UPDATE SET
         share_id=excluded.share_id,
         url=excluded.url,
         expires_at=excluded.expires_at,
         created_at=excluded.created_at,
         mtime=excluded.mtime,
         size_bytes=excluded.size_bytes`,
    )
    .run(
      row.tool,
      row.name,
      row.shareId,
      row.url,
      row.expiresAt,
      row.createdAt,
      row.mtime,
      row.sizeBytes,
    );
}

// ===== install_records（安装记录）=====
/** 保留最近多少条安装记录（写时裁剪）。 */
const INSTALL_RECORD_KEEP = 200;

/** 待落库的一条安装记录输入（不含 id/at —— 由 insert 补）。 */
export interface InstallRecordRow {
  channel: InstallRecordChannel;
  label: string;
  skillName: string | null;
  status: InstallRecordStatus;
  error: string | null;
  targets: InstallRecordTarget[];
}

function safeParseTargets(raw: string): InstallRecordTarget[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as InstallRecordTarget[]) : [];
  } catch {
    return [];
  }
}

function rowToInstallRecord(r: any): InstallRecord {
  const targets = safeParseTargets(r.targets);
  const error = r.error ?? null;
  return {
    id: r.id,
    at: r.at,
    channel: r.channel as InstallRecordChannel,
    label: r.label,
    skillName: r.skill_name ?? null,
    status: r.status as InstallRecordStatus,
    error,
    errorType: deriveRecordErrorType(targets, error),
    targets,
  };
}

/** 写入一条安装记录，并裁剪到最近 {@link INSTALL_RECORD_KEEP} 条。 */
export function insertInstallRecord(rec: InstallRecordRow): void {
  const d = getDb();
  d.prepare(
    `INSERT INTO install_records (at, channel, label, skill_name, status, error, targets)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(Date.now(), rec.channel, rec.label, rec.skillName, rec.status, rec.error, JSON.stringify(rec.targets));
  d.exec(
    `DELETE FROM install_records WHERE id NOT IN (
       SELECT id FROM install_records ORDER BY at DESC, id DESC LIMIT ${INSTALL_RECORD_KEEP}
     )`,
  );
}

/** 按时间倒序读取安装记录（默认最近 {@link INSTALL_RECORD_KEEP} 条）。 */
export function listInstallRecords(limit: number = INSTALL_RECORD_KEEP): InstallRecord[] {
  return (
    getDb()
      .prepare('SELECT * FROM install_records ORDER BY at DESC, id DESC LIMIT ?')
      .all(limit) as any[]
  ).map(rowToInstallRecord);
}

/** 清空全部安装记录。 */
export function clearInstallRecords(): void {
  getDb().exec('DELETE FROM install_records');
}

export function listMarket(args: { q?: string; owner?: string; page: number; pageSize: number }): MarketSkill[] {
  const where: string[] = [];
  const params: any[] = [];
  if (args.q) {
    where.push('(LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(owner) LIKE ?)');
    const like = `%${args.q.toLowerCase()}%`;
    params.push(like, like, like);
  }
  if (args.owner) {
    where.push('owner = ?');
    params.push(args.owner);
  }
  const offset = (args.page - 1) * args.pageSize;
  const sql =
    'SELECT * FROM market_skills' +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') +
    ' ORDER BY is_official DESC, owner ASC, name ASC' +
    ' LIMIT ? OFFSET ?';
  return (getDb().prepare(sql).all(...params, args.pageSize, offset) as any[]).map(rowToMarket);
}
