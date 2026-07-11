import fs from 'node:fs';
import path from 'node:path';
import { TOOLS, ALL_TOOLS, isGlobalAgentsOnlyTool } from './tools.js';
import { readSkillMd } from './skill-md.js';
import { clearInstalled, upsertInstalled, listInstalled as dbListInstalled } from './db.js';
import { dirSize } from './fs-util.js';
import type { InstalledSkill, Tool, InstalledFilter } from '../shared/types.js';

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

/**
 * 本机是否存在该 agent 的配置/数据目录（`TOOLS[tool].detectRoots`）。
 * 纯全局仓工具（skill 路径完全等同 ~/.agents/skills）恒为 false。
 * 用于扫描范围；UI 展示另见 installedTools()（还需 skill 数 > 0）。
 */
export function isToolInstalled(tool: Tool): boolean {
  // 完全沿用 ~/.agents/skills → 不单独显示/扫描为独立工具
  if (isGlobalAgentsOnlyTool(tool)) return false;

  const roots = TOOLS[tool].detectRoots;
  for (const p of roots) {
    if (p && fs.existsSync(p)) return true;
  }
  return false;
}

/** 该工具 skill 目录下是否至少有一个有效 skill（含 SKILL.md）。 */
export function toolHasSkills(tool: Tool): boolean {
  return scanTool(tool).length > 0;
}

/**
 * UI 可展示的工具：本机有 agent 配置，且至少有 1 个 skill。
 * skill 数为 0 的不出现在 chip / 安装选择器（避免空壳工具占位）。
 */
export function installedTools(): Tool[] {
  return ALL_TOOLS.filter((tool) => isToolInstalled(tool) && toolHasSkills(tool));
}

export function scanAll(): InstalledSkill[] {
  const all: InstalledSkill[] = [];
  // 只扫本机有配置且非「纯全局仓」的工具；共享目录 skill 见 scanGlobalRepo
  for (const tool of ALL_TOOLS) {
    if (!isToolInstalled(tool)) continue;
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
