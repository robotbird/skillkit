import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

/** Portable backup: tool identifiers and relative paths only, never another computer's home path. */
export const SNAPSHOT_DIR = '.skillkit-sync';
export interface SyncSource {
  tool: string;
  label?: string;
  kind?: string;
  relative: string;
  source: string;
}
interface Entry extends Omit<SyncSource, 'source'> { payload: string }
interface Manifest { version: 1; entries: Entry[] }

function relativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 &&
    value.split('/').every((part) => !!part && part !== '.' && part !== '..' &&
      !/[\\:\x00-\x1f]/.test(part) && part.toLowerCase() !== '.git' && part !== SNAPSHOT_DIR);
}

/** Dereference links when exporting so the backup contains files, not machine-specific links. */
function copyTree(source: string, destination: string, ancestors = new Set<string>(), allowLinks = true): void {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink() && !allowLinks) throw new Error('同步备份包含不安全的软链');
  const real = fs.realpathSync(source);
  if (ancestors.has(real)) throw new Error(`Skill 中存在循环软链：${source}`);
  const resolved = fs.statSync(source);
  if (resolved.isDirectory()) {
    const next = new Set(ancestors).add(real);
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source).sort()) {
      if (name === '.git') continue;
      copyTree(path.join(source, name), path.join(destination, name), next, allowLinks);
    }
  } else if (resolved.isFile()) {
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, resolved.mode & 0o777);
  } else {
    throw new Error(`Skill 包含不支持的文件：${source}`);
  }
}

export function writeSnapshot(root: string, sources: SyncSource[]): void {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-sync-'));
  try {
    const entries: Entry[] = [];
    const seen = new Set<string>();
    for (const { source, ...entry } of sources.sort((a, b) =>
      `${a.tool}/${a.relative}`.localeCompare(`${b.tool}/${b.relative}`))) {
      if (!relativePath(entry.relative)) throw new Error(`无法同步此 Skill 路径：${entry.relative}`);
      const key = `${entry.tool}/${entry.relative}`;
      if (seen.has(key)) throw new Error(`多个 Skill 使用同一恢复路径：${key}`);
      seen.add(key);
      const payload = createHash('sha256').update(key).digest('hex');
      copyTree(source, path.join(temp, payload));
      entries.push({ ...entry, payload });
    }
    fs.writeFileSync(path.join(temp, 'manifest.json'), JSON.stringify({ version: 1, entries }, null, 2) + '\n');
    const target = path.join(root, SNAPSHOT_DIR);
    // Build the complete snapshot first: a broken link or read error cannot destroy the previous backup.
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(temp, target, { recursive: true });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** Validate and stage every payload before touching tool directories. Unknown local mappings stay in the backup. */
export function restoreSnapshot(
  root: string,
  resolveRoot: (entry: Omit<SyncSource, 'source'>) => string | undefined,
): { restored: number; warnings: string[] } {
  const snapshot = path.join(root, SNAPSHOT_DIR);
  if (!fs.existsSync(snapshot)) return { restored: 0, warnings: ['旧版备份没有工具分发清单，请在全局仓库中选择“安装到工具”。'] };
  if (fs.lstatSync(snapshot).isSymbolicLink()) throw new Error('同步清单目录不能是软链');
  const manifestPath = path.join(snapshot, 'manifest.json');
  if (fs.lstatSync(manifestPath).isSymbolicLink()) throw new Error('同步清单不能是软链');
  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.entries)) throw new Error('不支持的同步清单版本');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-restore-'));
  const warnings: string[] = [];
  const operations: { source: string; destination: string; base: string }[] = [];
  const destinations = new Set<string>();
  let restored = 0;
  try {
    for (const entry of manifest.entries) {
      if (!entry || typeof entry.tool !== 'string' || !relativePath(entry.relative) ||
          typeof entry.payload !== 'string' || !/^[a-f0-9]{64}$/.test(entry.payload) ||
          (entry.label !== undefined && typeof entry.label !== 'string') ||
          (entry.kind !== undefined && typeof entry.kind !== 'string')) throw new Error('同步清单路径或格式无效');
      const source = path.join(temp, String(operations.length));
      const base = resolveRoot(entry);
      if (!base) {
        warnings.push(`未分发 ${entry.label || entry.tool}/${entry.relative}：请先在本机添加同名、同类型的 Skill 空间后重新拉取。`);
        continue;
      }
      const destination = path.join(base, ...entry.relative.split('/'));
      const key = process.platform === 'win32' ? destination.toLowerCase() : destination;
      if (destinations.has(key)) throw new Error('同步清单包含重复目标路径');
      destinations.add(key);
      copyTree(path.join(snapshot, entry.payload), source, new Set(), false);
      if (!fs.existsSync(path.join(source, 'SKILL.md')) && !fs.existsSync(path.join(source, 'AGENTS.md'))) {
        throw new Error(`同步备份缺少 Skill 文件：${entry.relative}`);
      }
      operations.push({ source, destination, base });
    }
    for (const { source, destination, base } of operations) {
      try {
        // Never follow a nested destination directory symlink outside the selected tool root.
        let parent = path.dirname(destination);
        while (parent !== base) {
          if (fs.lstatSync(parent, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('目标父目录是软链');
          parent = path.dirname(parent);
        }
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const backup = `${destination}.bak-${Date.now()}`;
        const exists = !!fs.lstatSync(destination, { throwIfNoEntry: false });
        if (exists) fs.renameSync(destination, backup);
        try {
          copyTree(source, destination);
        } catch (error) {
          fs.rmSync(destination, { recursive: true, force: true });
          if (exists) fs.renameSync(backup, destination);
          throw error;
        }
        if (exists) fs.rmSync(backup, { recursive: true, force: true });
        restored++;
      } catch (error) {
        warnings.push(`${destination}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { restored, warnings };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
