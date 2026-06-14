import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShareMeta } from '../../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');

export function ensureDir() {
  fsSync.mkdirSync(DATA_DIR, { recursive: true });
}

function metaPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}
function zipPath(id: string) {
  return path.join(DATA_DIR, `${id}.zip`);
}

export function exists(id: string): boolean {
  return fsSync.existsSync(metaPath(id)) && fsSync.existsSync(zipPath(id));
}

export async function writeShare(meta: ShareMeta, zip: Buffer): Promise<void> {
  ensureDir();
  await fs.writeFile(zipPath(meta.id), zip);
  await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf8');
}

export async function readMeta(id: string): Promise<ShareMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(id), 'utf8');
    return JSON.parse(raw) as ShareMeta;
  } catch {
    return null;
  }
}

export function readZipStream(id: string): fsSync.ReadStream | null {
  const p = zipPath(id);
  if (!fsSync.existsSync(p)) return null;
  return fsSync.createReadStream(p);
}

export async function deleteShare(id: string): Promise<void> {
  await Promise.all([
    fs.rm(metaPath(id), { force: true }),
    fs.rm(zipPath(id), { force: true }),
  ]);
}

export async function sweepExpired(now: number = Date.now()): Promise<number> {
  ensureDir();
  let removed = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(DATA_DIR);
  } catch {
    return 0;
  }
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    const id = f.slice(0, -5);
    const meta = await readMeta(id);
    if (!meta) continue;
    if (meta.expiresAt <= now) {
      await deleteShare(id);
      removed++;
    }
  }
  return removed;
}
