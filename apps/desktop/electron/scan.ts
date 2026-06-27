import fs from 'node:fs';
import path from 'node:path';
import { TOOLS, ALL_TOOLS } from './tools.js';
import { readSkillMd } from './skill-md.js';
import { clearInstalled, upsertInstalled, listInstalled as dbListInstalled } from './db.js';
import type { InstalledSkill, Tool, InstalledFilter } from '../shared/types.js';

function dirSize(dir: string): number {
  let total = 0;
  try {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        const full = path.join(cur, e.name);
        try {
          if (e.isDirectory()) stack.push(full);
          else if (e.isFile()) total += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return total;
}

export function scanTool(tool: Tool): InstalledSkill[] {
  const cfg = TOOLS[tool];
  const out: InstalledSkill[] = [];
  for (const root of cfg.roots) {
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith('.')) continue;
      const skillDir = path.join(root, e.name);

      let realDir = skillDir;
      try {
        const st = fs.statSync(skillDir); // 跟随软链
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }

      const md = readSkillMd(realDir);
      if (!md) continue;
      const name = md.name?.trim() || e.name;
      const description = md.description?.trim() || null;

      const isBuiltin = !!cfg.builtinRoot && root === cfg.builtinRoot;
      let mtime: number | null = null;
      try {
        mtime = fs.statSync(realDir).mtimeMs;
      } catch {
        /* ignore */
      }

      out.push({
        tool,
        name,
        description,
        path: realDir,
        isBuiltin,
        sizeBytes: dirSize(realDir),
        mtime,
        source: isBuiltin ? 'builtin' : null,
        installedAt: null,
      });
    }
  }
  return out;
}

/** 工具是否「已安装」:其用户级根目录(~/.<tool>,即 installRoot 的父目录)存在。
 *  不检查 skills 子目录本身——工具装了但还没 skill 时也应可见/可选(否则无法安装第一个 skill)。 */
export function isToolInstalled(tool: Tool): boolean {
  return fs.existsSync(path.dirname(TOOLS[tool].installRoot));
}

/** 所有已安装工具(按 ALL_TOOLS 顺序),用于 UI 只展示这些工具。 */
export function installedTools(): Tool[] {
  return ALL_TOOLS.filter(isToolInstalled);
}

export function scanAll(): InstalledSkill[] {
  const all: InstalledSkill[] = [];
  for (const tool of ALL_TOOLS) {
    all.push(...scanTool(tool));
  }
  // 重写 db：清空 + 重新写入（一次扫描就是真相，简单可靠）
  clearInstalled();
  for (const s of all) upsertInstalled(s);
  return all;
}

export function listInstalled(filter?: InstalledFilter): InstalledSkill[] {
  return dbListInstalled(filter);
}
