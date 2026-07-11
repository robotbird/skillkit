import path from 'node:path';
import os from 'node:os';
import { ALL_TOOLS, type Tool } from '../shared/types.js';

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
   * 判断「本机是否安装了该 AI 工具」的标记路径（任一存在即为已安装）。
   * 注意：不能用 skills 目录父路径 alone——例如 cline/warp/kimi 共享 ~/.agents/skills，
   * 若只查 ~/.agents 会在仅有全局仓时误报三者均已安装。
   * 标记对齐 vercel-labs/skills 的 detectInstalled + 本机常见路径。
   */
  detectRoots: string[];
}

/**
 * 各 AI 工具的用户级 skill 目录映射。
 * - 路径对齐 vercel-labs/skills（npx skills）Supported Agents + Grok Build 实装
 * - cline / warp / kimi 与全局仓共享 ~/.agents/skills（方案 A）
 * - 本阶段仅用户级；项目级目录不扫不装
 */
export const TOOLS: Record<Tool, ToolConfig> = {
  claude: {
    label: 'Claude Code',
    roots: [skillRoot('.claude', 'skills')],
    installRoot: skillRoot('.claude', 'skills'),
    detectRoots: [skillRoot('.claude')],
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
  },
  cursor: {
    label: 'Cursor',
    roots: [skillRoot('.cursor', 'skills'), skillRoot('.cursor', 'skills-cursor')],
    installRoot: skillRoot('.cursor', 'skills'),
    detectRoots: [skillRoot('.cursor')],
  },
  trae: {
    label: 'Trae',
    roots: [skillRoot('.trae', 'skills'), skillRoot('.trae', 'builtin_skills')],
    installRoot: skillRoot('.trae', 'skills'),
    builtinRoot: skillRoot('.trae', 'builtin_skills'),
    detectRoots: [skillRoot('.trae')],
  },
  workbuddy: {
    label: 'Workbuddy',
    roots: [skillRoot('.workbuddy', 'skills')],
    installRoot: skillRoot('.workbuddy', 'skills'),
    detectRoots: [skillRoot('.workbuddy')],
  },
  qoder: {
    label: 'Qoder',
    roots: [skillRoot('.qoder', 'skills')],
    installRoot: skillRoot('.qoder', 'skills'),
    detectRoots: [skillRoot('.qoder')],
  },
  grok: {
    label: 'Grok',
    roots: [skillRoot('.grok', 'skills')],
    installRoot: skillRoot('.grok', 'skills'),
    // Grok Build / grok CLI：配置与 skill 均在 ~/.grok
    detectRoots: [skillRoot('.grok')],
  },
  opencode: {
    label: 'OpenCode',
    roots: [skillRoot('.config', 'opencode', 'skills')],
    installRoot: skillRoot('.config', 'opencode', 'skills'),
    detectRoots: [skillRoot('.config', 'opencode'), skillRoot('.opencode')],
  },
  gemini: {
    label: 'Gemini CLI',
    roots: [skillRoot('.gemini', 'skills')],
    installRoot: skillRoot('.gemini', 'skills'),
    detectRoots: [skillRoot('.gemini')],
  },
  antigravity: {
    label: 'Antigravity',
    roots: [skillRoot('.gemini', 'antigravity', 'skills')],
    installRoot: skillRoot('.gemini', 'antigravity', 'skills'),
    detectRoots: [skillRoot('.gemini', 'antigravity')],
  },
  windsurf: {
    label: 'Windsurf',
    roots: [skillRoot('.codeium', 'windsurf', 'skills')],
    installRoot: skillRoot('.codeium', 'windsurf', 'skills'),
    detectRoots: [skillRoot('.codeium', 'windsurf')],
  },
  augment: {
    label: 'Augment',
    roots: [skillRoot('.augment', 'skills')],
    installRoot: skillRoot('.augment', 'skills'),
    detectRoots: [skillRoot('.augment')],
  },
  codebuddy: {
    label: 'CodeBuddy',
    roots: [skillRoot('.codebuddy', 'skills')],
    installRoot: skillRoot('.codebuddy', 'skills'),
    detectRoots: [skillRoot('.codebuddy')],
  },
  pi: {
    label: 'Pi',
    roots: [skillRoot('.pi', 'agent', 'skills')],
    installRoot: skillRoot('.pi', 'agent', 'skills'),
    detectRoots: [skillRoot('.pi', 'agent'), skillRoot('.pi')],
  },
  kiro: {
    label: 'Kiro CLI',
    roots: [skillRoot('.kiro', 'skills')],
    installRoot: skillRoot('.kiro', 'skills'),
    detectRoots: [skillRoot('.kiro')],
  },
  hermes: {
    label: 'Hermes',
    roots: [skillRoot('.hermes', 'skills')],
    installRoot: skillRoot('.hermes', 'skills'),
    detectRoots: [skillRoot('.hermes')],
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
 */
export function isGlobalAgentsOnlyTool(tool: Tool): boolean {
  const cfg = TOOLS[tool];
  const global = path.resolve(globalAgentsSkillsRoot());
  if (path.resolve(cfg.installRoot) !== global) return false;
  return cfg.roots.every((r) => path.resolve(r) === global);
}
