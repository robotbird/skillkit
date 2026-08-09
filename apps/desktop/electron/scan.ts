import fs from 'node:fs';
import path from 'node:path';
import {
  getToolConfig,
  allToolIds,
  isCustomTool,
  isGlobalAgentsOnlyTool,
  customKindOf,
  customSkillsRootOf,
  PROJECT_AGENT_DIRS,
} from './tools.js';
import { readSkillMd } from './skill-md.js';
import { upsertInstalled, listInstalled as dbListInstalled, deleteStaleInstalled } from './db.js';
import { dirSize } from './fs-util.js';
import type { InstalledSkill, Tool, BuiltinTool, InstalledFilter } from '../shared/types.js';

export function scanTool(tool: Tool): InstalledSkill[] {
  const cfg = getToolConfig(tool);
  if (!cfg) return [];
  const out: InstalledSkill[] = [];

  // 最多扫描 2 级：兼容 hermes 中文版 skills/<分类>/<skill>/SKILL.md 这种多级布局——
  // 同一 root 下混着「一级 skill」(root/<skill>/SKILL.md) 与「分组目录 + 二级 skill」
  // (root/<分类>/<skill>/SKILL.md，分类目录只有 DESCRIPTION.md)。
  // 规则：某级目录自身有 SKILL.md/AGENTS.md 就视作 skill（不再下沉）；否则下沉一层继续找。
  // 普通一级布局的工具行为不变——一级命中后不会递归，二级分支只在一级无 SKILL.md 时触发。
  const MAX_DEPTH = 2;
  // curAgent：当前扫描上下文所属的内置 agent。仅「项目」类型扫描项目根下各 agent 子目录时
  // 带值（如 .claude/skills → 'claude'）；其余分支恒为 null。项目 skill 的 tool 仍是项目
  // custom id（保持 DB UNIQUE + 项目隔离），agent 仅用于渲染层显示对应 agent 的 icon。
  const scan = (dir: string, depth: number, topRoot: string, curAgent: BuiltinTool | null): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith('.')) continue;
      const sub = path.join(dir, e.name);
      let st: fs.Stats;
      try {
        st = fs.statSync(sub); // 跟随软链；悬空软链抛错 → 跳过
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;

      const md = readSkillMd(sub);
      if (md) {
        const name = md.name?.trim() || e.name;
        const isBuiltin = !!cfg.builtinRoot && topRoot === cfg.builtinRoot;
        out.push({
          tool,
          name,
          description: md.description?.trim() || null,
          path: sub,
          isBuiltin,
          sizeBytes: dirSize(sub),
          mtime: st.mtimeMs,
          source: isBuiltin ? 'builtin' : null,
          installedAt: null,
          agent: curAgent,
        });
      } else if (depth < MAX_DEPTH) {
        // 当前目录无 SKILL.md → 当作分组目录，下沉一层（不超过 2 级）
        scan(sub, depth + 1, topRoot, curAgent);
      }
    }
  };

  // 「项目」类型：扫描项目根下各内置 agent 的标准 skill 子目录，每个子目录命中的 skill
  // 标记对应 agent。skill 仍归属项目 custom tool，由渲染层据 agent 显示对应 icon。
  if (customKindOf(tool) === 'project') {
    const projectRoot = customSkillsRootOf(tool);
    if (projectRoot && fs.existsSync(projectRoot)) {
      for (const { agent, dir } of PROJECT_AGENT_DIRS) {
        const sub = path.join(projectRoot, dir);
        if (!fs.existsSync(sub)) continue;
        scan(sub, 1, sub, agent);
      }
      // fallback：项目下没有任何标准 agent 子目录（或都为空）——可能是老用户把 skill 目录
      // 直接填成了 skillsRoot，退回把它当普通 skill 根扫一遍，避免升级后列表「凭空消失」。
      if (out.length === 0) {
        scan(projectRoot, 1, projectRoot, null);
      }
    }
    return out;
  }

  for (const root of cfg.roots) {
    if (!fs.existsSync(root)) continue;
    scan(root, 1, root, null);
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
  // 自定义 agent：用户显式声明，恒视为已存在（目录可后由安装 mkdir -p 创建）。
  if (isCustomTool(tool)) return true;

  const cfg = getToolConfig(tool);
  if (!cfg) return false;
  for (const p of cfg.detectRoots) {
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
  return allToolIds().filter((tool) => isToolInstalled(tool) && toolHasSkills(tool));
}

export function scanAll(): InstalledSkill[] {
  const all: InstalledSkill[] = [];
  // 只扫本机有配置且非「纯全局仓」的工具；共享目录 skill 见 scanGlobalRepo
  for (const tool of allToolIds()) {
    if (!isToolInstalled(tool)) continue;
    all.push(...scanTool(tool));
  }
  // 重写 db：merge-upsert 保留安装时写入的 source/installed_at（靠 upsertInstalled 的 COALESCE，
  // 这两个是「安装来源元数据」，不可从文件系统重建，故跨扫描保留），再删除扫描集之外的旧行
  // （已卸载 / frontmatter name 变更）。其余字段以扫描值为准。文件系统仍是 skill 内容的真相。
  for (const s of all) upsertInstalled(s);
  deleteStaleInstalled(new Set(all.map((s) => `${s.tool}|${s.name}`)));
  // 返回 DB 合并后的视图，而非扫描构建的 all：scanTool 把 source 写死成 null/builtin，
  // 直接返回 all 会让渲染层永远拿不到 GitHub 来源。DB 里的 source/installed_at 已被 COALESCE 保留。
  return dbListInstalled();
}

export function listInstalled(filter?: InstalledFilter): InstalledSkill[] {
  return dbListInstalled(filter);
}
