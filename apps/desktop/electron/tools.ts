import path from 'node:path';
import os from 'node:os';
import { ALL_TOOLS, CUSTOM_TOOL_PREFIX, type Tool, type BuiltinTool, type CustomTool, type CustomToolKind } from '../shared/types.js';
import { listCustomTools, insertCustomTool, deleteCustomTool, updateCustomToolMeta as dbUpdateCustomToolMeta } from './db.js';

export { ALL_TOOLS };

// 跨平台「用户主目录」:macOS 下是 ~,Windows 下是 %USERPROFILE%(os.homedir() 自动按平台取)。
// 多数工具的 skill 默认目录遵循 ~/.<tool>/skills 或 XDG 风格 ~/.config/<tool>/skills。
// 若将来某工具在 Windows 下改用 %APPDATA% 等不同位置,只需在 skillRoot 里按 process.platform 分支。
const home = os.homedir();

/** 拼出某工具在用户主目录下的路径(路径分隔由 path.join 跨平台归一化)。 */
const skillRoot = (...seg: string[]) => path.join(home, ...seg);

export interface ToolConfig {
  label: string;
  // 扫描的所有 root（一个工具可能有多个，比如 cursor 的 skills 和 skills-cursor）
  roots: string[];
  // 安装目标 root（始终选第一个安全的用户级目录）
  installRoot: string;
  // 哪个 root 下的 skill 标记为 builtin（不可卸载）
  builtinRoot?: string;
  /**
   * 该工具的配置/数据目录，用于 scanAll 决定「扫描哪些目录找已装 skill」
   * （目录下有 skill 就扫，与产品是否真装无关）。
   * 注意：目录存在 ≠ 产品真装（可能是卸载残留 / 嵌套工具父目录 / 装技能时顺带建出的目录），
   * 「是否安装」一律走 appBundles/cliBinaries 真身探测（见 detect.ts），不读本字段。
   */
  detectRoots: string[];
  /** macOS .app 包名（如 'Cursor.app'），在 /Applications、~/Applications、/System/Applications 及一级子目录下查找。 */
  appBundles?: string[];
  /** CLI 可执行命令名（如 'codex'），在常见安装目录(homebrew/npm/nvm 等)与 PATH 下查找。 */
  cliBinaries?: string[];
}

/**
 * 各 AI 工具的用户级 skill 目录映射。
 * - 路径对齐 vercel-labs/skills（npx skills）Supported Agents + Grok Build 实装
 * - cline / warp / kimi 与全局仓共享 ~/.agents/skills（方案 A）
 * - 本阶段仅用户级；项目级目录不扫不装
 */
export const TOOLS: Record<BuiltinTool, ToolConfig> = {
  claude: {
    label: 'Claude Code',
    roots: [skillRoot('.claude', 'skills')],
    installRoot: skillRoot('.claude', 'skills'),
    detectRoots: [skillRoot('.claude')],
    appBundles: ['Claude.app'],
    cliBinaries: ['claude'],
  },
  codex: {
    label: 'Codex',
    roots: [skillRoot('.codex', 'skills')],
    installRoot: skillRoot('.codex', 'skills'),
    // 企业镜像偶发 /etc/codex（与 npx skills 一致）
    detectRoots:
      process.platform === 'win32'
        ? [skillRoot('.codex')]
        : [skillRoot('.codex'), '/etc/codex'],
    // Codex 桌面端已改名并入 ChatGPT.app（bundle id 仍为 com.openai.codex）；
    // 仍保留 codex CLI 名，覆盖只装了命令行的用户。
    appBundles: ['ChatGPT.app'],
    cliBinaries: ['codex'],
  },
  cursor: {
    label: 'Cursor',
    roots: [skillRoot('.cursor', 'skills'), skillRoot('.cursor', 'skills-cursor')],
    installRoot: skillRoot('.cursor', 'skills'),
    detectRoots: [skillRoot('.cursor')],
    appBundles: ['Cursor.app'],
    cliBinaries: ['cursor'],
  },
  trae: {
    label: 'Trae',
    roots: [skillRoot('.trae', 'skills'), skillRoot('.trae', 'builtin_skills')],
    installRoot: skillRoot('.trae', 'skills'),
    builtinRoot: skillRoot('.trae', 'builtin_skills'),
    detectRoots: [skillRoot('.trae')],
    appBundles: ['Trae.app'],
  },
  workbuddy: {
    label: 'Workbuddy',
    roots: [skillRoot('.workbuddy', 'skills')],
    installRoot: skillRoot('.workbuddy', 'skills'),
    detectRoots: [skillRoot('.workbuddy')],
    appBundles: ['WorkBuddy.app'],
  },
  qoder: {
    label: 'Qoder',
    roots: [skillRoot('.qoder', 'skills')],
    installRoot: skillRoot('.qoder', 'skills'),
    detectRoots: [skillRoot('.qoder')],
    appBundles: ['Qoder.app'],
  },
  grok: {
    label: 'Grok',
    roots: [skillRoot('.grok', 'skills')],
    installRoot: skillRoot('.grok', 'skills'),
    // Grok Build / grok CLI：配置与 skill 均在 ~/.grok
    detectRoots: [skillRoot('.grok')],
    cliBinaries: ['grok'],
  },
  opencode: {
    label: 'OpenCode',
    roots: [skillRoot('.config', 'opencode', 'skills')],
    installRoot: skillRoot('.config', 'opencode', 'skills'),
    detectRoots: [skillRoot('.config', 'opencode'), skillRoot('.opencode')],
    cliBinaries: ['opencode'],
  },
  gemini: {
    label: 'Gemini CLI',
    roots: [skillRoot('.gemini', 'skills')],
    installRoot: skillRoot('.gemini', 'skills'),
    detectRoots: [skillRoot('.gemini')],
    cliBinaries: ['gemini'],
  },
  antigravity: {
    label: 'Antigravity',
    roots: [skillRoot('.gemini', 'antigravity', 'skills')],
    installRoot: skillRoot('.gemini', 'antigravity', 'skills'),
    detectRoots: [skillRoot('.gemini', 'antigravity')],
    appBundles: ['Antigravity.app'],
  },
  windsurf: {
    label: 'Windsurf',
    roots: [skillRoot('.codeium', 'windsurf', 'skills')],
    installRoot: skillRoot('.codeium', 'windsurf', 'skills'),
    detectRoots: [skillRoot('.codeium', 'windsurf')],
    appBundles: ['Windsurf.app'],
    cliBinaries: ['windsurf'],
  },
  augment: {
    label: 'Augment',
    roots: [skillRoot('.augment', 'skills')],
    installRoot: skillRoot('.augment', 'skills'),
    detectRoots: [skillRoot('.augment')],
    appBundles: ['Augment.app'],
    cliBinaries: ['augment'],
  },
  codebuddy: {
    label: 'CodeBuddy',
    roots: [skillRoot('.codebuddy', 'skills')],
    installRoot: skillRoot('.codebuddy', 'skills'),
    detectRoots: [skillRoot('.codebuddy')],
    cliBinaries: ['codebuddy'],
  },
  pi: {
    label: 'Pi',
    roots: [skillRoot('.pi', 'agent', 'skills')],
    installRoot: skillRoot('.pi', 'agent', 'skills'),
    detectRoots: [skillRoot('.pi', 'agent'), skillRoot('.pi')],
    cliBinaries: ['pi'],
  },
  kiro: {
    label: 'Kiro CLI',
    roots: [skillRoot('.kiro', 'skills')],
    installRoot: skillRoot('.kiro', 'skills'),
    detectRoots: [skillRoot('.kiro')],
    appBundles: ['Kiro.app'],
    cliBinaries: ['kiro'],
  },
  hermes: {
    label: 'Hermes',
    roots: [skillRoot('.hermes', 'skills')],
    installRoot: skillRoot('.hermes', 'skills'),
    detectRoots: [skillRoot('.hermes')],
    cliBinaries: ['hermes'],
  },
  openclaw: {
    label: 'OpenClaw',
    roots: [
      skillRoot('.openclaw', 'skills'),
      skillRoot('.clawdbot', 'skills'),
      skillRoot('.moltbot', 'skills'),
    ],
    installRoot: skillRoot('.openclaw', 'skills'),
    detectRoots: [skillRoot('.openclaw'), skillRoot('.clawdbot'), skillRoot('.moltbot')],
    cliBinaries: ['openclaw'],
  },
  // 与全局仓 ~/.agents/skills 完全相同：UI/扫描不单独展示（见 isGlobalAgentsOnlyTool），
  // 由「全局仓库」统一管理；保留配置以便路径查询与未来扩展。
  cline: {
    label: 'Cline',
    roots: [skillRoot('.agents', 'skills')],
    installRoot: skillRoot('.agents', 'skills'),
    detectRoots: [skillRoot('.cline')],
  },
  warp: {
    label: 'Warp',
    roots: [skillRoot('.agents', 'skills')],
    installRoot: skillRoot('.agents', 'skills'),
    detectRoots: [skillRoot('.warp')],
  },
  kimi: {
    label: 'Kimi Code CLI',
    roots: [skillRoot('.agents', 'skills')],
    installRoot: skillRoot('.agents', 'skills'),
    detectRoots: [skillRoot('.kimi-code'), skillRoot('.kimi')],
  },
};

/** 全局共享 skill 目录（与 electron/global-repo.globalRepoRoot 一致）。 */
export function globalAgentsSkillsRoot(): string {
  return skillRoot('.agents', 'skills');
}

/**
 * 工具的 skill 路径是否「完全等同」全局仓 ~/.agents/skills（无独立用户目录）。
 * 这类工具不在 chip / 安装选择器里单独出现，统一走全局仓库。
 * 自定义 agent 恒为 false（其根目录是用户指定的独立目录）。
 */
export function isGlobalAgentsOnlyTool(tool: Tool): boolean {
  if (isCustomTool(tool)) return false; // 自定义 agent 恒为独立工具，不并入全局仓
  const cfg = getToolConfig(tool);
  if (!cfg) return false;
  const global = path.resolve(globalAgentsSkillsRoot());
  if (path.resolve(cfg.installRoot) !== global) return false;
  return cfg.roots.every((r) => path.resolve(r) === global);
}

// ===== 自定义 agent 运行期注册表（DB 持久化，缓存于内存）=====
// 内置 TOOLS 是静态闭集；自定义 agent 由用户在设置里声明，启动后从 custom_tools 表懒加载合并。
// getToolConfig / allToolIds 是所有「按 tool 取配置 / 遍历工具」入口的统一去向，
// 使自定义工具能像内置工具一样被扫描/安装/卸载/复制。

let customCache: CustomTool[] = [];
let customConfigMap = new Map<string, ToolConfig>();
let customLoaded = false;

/** 把一条自定义 agent 合成 ToolConfig（roots/installRoot 均指向 skillsRoot，无 builtin/app/cli）。 */
function customToConfig(c: CustomTool): ToolConfig {
  return {
    label: c.label,
    roots: [c.skillsRoot],
    installRoot: c.skillsRoot,
    detectRoots: [c.skillsRoot],
  };
}

/** 从 DB 加载自定义 agent 到内存缓存（幂等；仅首次访问时触发，add/remove 后显式 reload）。 */
function ensureCustomLoaded(): void {
  if (customLoaded) return;
  customCache = listCustomTools();
  customConfigMap = new Map(customCache.map((c) => [c.id, customToConfig(c)]));
  customLoaded = true;
}

/** 强制重新从 DB 加载（add/remove 后调用）。 */
export function reloadCustomTools(): void {
  customCache = listCustomTools();
  customConfigMap = new Map(customCache.map((c) => [c.id, customToConfig(c)]));
  customLoaded = true;
}

/** 是否为自定义 agent id。 */
export function isCustomTool(tool: Tool): boolean {
  return typeof tool === 'string' && tool.startsWith(CUSTOM_TOOL_PREFIX);
}

/**
 * 取某工具的合并配置（内置 TOOLS 优先，否则自定义 agent）。未知 id 返回 undefined。
 * 所有原 `TOOLS[tool]` 访问均改走这里，使自定义工具透明可用。
 */
export function getToolConfig(tool: Tool): ToolConfig | undefined {
  ensureCustomLoaded();
  const custom = customConfigMap.get(tool);
  if (custom) return custom;
  return TOOLS[tool as BuiltinTool];
}

/** 全部工具 id（内置闭集 + 自定义），用于遍历扫描/全局仓清理等。 */
export function allToolIds(): Tool[] {
  ensureCustomLoaded();
  return [...ALL_TOOLS, ...customCache.map((c) => c.id)];
}

/** 自定义 agent 元信息列表（渲染层 label 解析用）。 */
export function listCustomToolsMeta(): CustomTool[] {
  ensureCustomLoaded();
  return customCache;
}

/** 自定义 agent id 列表（detect.localTools 把它们并入「本机已装」以作安装目标）。 */
export function listCustomToolIds(): string[] {
  ensureCustomLoaded();
  return customCache.map((c) => c.id);
}

/** label → slug（小写、非字母数字归一为 -）；空则兜底 'agent'。 */
function slugify(label: string): string {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'agent';
}

/**
 * 新增自定义 skill 源：生成去重 id（custom:<slug>[-n]）、解析绝对路径、落库并刷新缓存。
 * 目录无需预先存在（安装时 installRoot 会 mkdir -p）；此处仅校验非空。
 * opts.kind 区分 agent 变体 / 项目（仅 UI 分组与默认图标推荐用）；
 * opts.icon 为品牌图标 key，空则首字母兜底；opts.iconImage 为上传图片 data URI，设置后优先于 icon。
 */
export function addCustomTool(
  label: string,
  skillsRoot: string,
  opts?: { kind?: CustomToolKind; icon?: BuiltinTool | null; iconImage?: string | null },
): CustomTool {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) throw new Error('名称不能为空');
  const root = skillsRoot.trim();
  if (!root) throw new Error('Skill 目录不能为空');
  ensureCustomLoaded();
  const slug = slugify(trimmedLabel);
  let id = `${CUSTOM_TOOL_PREFIX}${slug}`;
  let n = 2;
  while (customConfigMap.has(id)) id = `${CUSTOM_TOOL_PREFIX}${slug}-${n++}`;
  const tool: CustomTool = {
    id,
    label: trimmedLabel,
    skillsRoot: path.resolve(root),
    createdAt: Date.now(),
    kind: opts?.kind === 'project' ? 'project' : 'agent',
    icon: opts?.icon ?? null,
    iconImage: opts?.iconImage ?? null,
  };
  insertCustomTool(tool);
  reloadCustomTools();
  return tool;
}

/**
 * 修改自定义 skill 源的展示元数据（名称 / 图标 / 上传图片）。仅更新传入字段；改完刷新内存缓存。
 * 渲染层「点击换图 / 上传图片」走这里。
 */
export function updateCustomToolMeta(
  id: string,
  patch: { label?: string; icon?: BuiltinTool | null; iconImage?: string | null },
): void {
  if (!id.startsWith(CUSTOM_TOOL_PREFIX)) throw new Error('只能修改自定义 skill 源');
  dbUpdateCustomToolMeta(id, patch);
  reloadCustomTools();
}

/**
 * 删除自定义 skill 源：仅校验是自定义 id（防误删内置），DB 层负责级联清理孤儿行。
 * skill 目录文件不动——归用户所有，仅从 Skillkit 解除管理。
 */
export function removeCustomTool(id: string): void {
  if (!id.startsWith(CUSTOM_TOOL_PREFIX)) throw new Error('只能删除自定义 agent');
  deleteCustomTool(id);
  reloadCustomTools();
}

