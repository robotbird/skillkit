import { ALL_TOOLS, type InstalledSkill, type Tool } from '@shared/types';

/**
 * 一个 skill 跨工具的「合并视图」。
 *
 * 注意：这是**渲染层派生**的类型，不是存储模型——
 * `installed_skills` 表仍是一行=一个工具下的一个目录（文件系统是真相，DB 是缓存）。
 * 「同一个 skill 装在 N 个工具」是展示概念，由这里按 name 聚合得到。
 */
export interface SkillGroup {
  /** 跨工具身份键。codebase 早已默认 name = 跨工具身份（copyToTools 即按 name 复制）。 */
  name: string;
  /** 本组覆盖的工具，固定按 ALL_TOOLS 顺序排列（展示稳定、不跳动）。 */
  tools: Tool[];
  /** 各工具下的实际记录（可能不含全部工具）。 */
  byTool: Partial<Record<Tool, InstalledSkill>>;
  /** 展示用代表记录：优先非内置，其次 mtime 最新。用于名称/描述/大小等单一字段。 */
  primary: InstalledSkill;
}

/** cur 是否应让位给 cand 成为 primary。 */
function betterPrimary(cur: InstalledSkill, cand: InstalledSkill): boolean {
  if (cur.isBuiltin !== cand.isBuiltin) return !cand.isBuiltin; // 非内置优先
  return (cand.mtime ?? 0) > (cur.mtime ?? 0);
}

/**
 * 把扁平的 InstalledSkill[] 按 name 聚合成 SkillGroup[]。
 * 同名即视为同一个 skill（与 copyToTools 的跨工具身份假设一致）。
 */
export function groupBySkill(rows: InstalledSkill[]): SkillGroup[] {
  const map = new Map<string, SkillGroup>();
  for (const r of rows) {
    let g = map.get(r.name);
    if (!g) {
      g = { name: r.name, tools: [], byTool: {}, primary: r };
      map.set(r.name, g);
    }
    g.byTool[r.tool] = r;
    if (betterPrimary(g.primary, r)) g.primary = r;
  }
  const groups = [...map.values()];
  for (const g of groups) {
    g.tools = ALL_TOOLS.filter((t) => g.byTool[t]);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}
