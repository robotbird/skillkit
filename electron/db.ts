import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { InstalledSkill, MarketSkill, Tool } from '../shared/types.js';

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

    CREATE INDEX IF NOT EXISTS idx_market_owner ON market_skills(owner);
    CREATE INDEX IF NOT EXISTS idx_market_name ON market_skills(name);
  `);
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
