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
  const file = path.join(dir, 'skillzix.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

export function getDb(): Database.Database {
  if (!db) return initDb();
  return db;
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
