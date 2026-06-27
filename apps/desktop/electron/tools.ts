import path from 'node:path';
import os from 'node:os';
import type { Tool } from '../shared/types.js';

// 跨平台「用户主目录」:macOS 下是 ~,Windows 下是 %USERPROFILE%(os.homedir() 自动按平台取)。
// 五个工具的 skill 默认目录都遵循 ~/.<tool>/skills 约定,因此同一份相对路径在两端都能解析到
// 正确位置(mac: ~/.claude/skills,win: C:\Users\<u>\.claude\skills)。
// 若将来某工具在 Windows 下改用 %APPDATA% 等不同位置,只需在 skillRoot 里按 process.platform 分支。
const home = os.homedir();

/** 拼出某工具在用户主目录下的 skill 目录(路径分隔由 path.join 跨平台归一化)。 */
const skillRoot = (...seg: string[]) => path.join(home, ...seg);

export interface ToolConfig {
  label: string;
  // 扫描的所有 root（一个工具可能有多个，比如 cursor 的 skills 和 skills-cursor）
  roots: string[];
  // 安装目标 root（始终选第一个安全的用户级目录）
  installRoot: string;
  // 哪个 root 下的 skill 标记为 builtin（不可卸载）
  builtinRoot?: string;
}

export const TOOLS: Record<Tool, ToolConfig> = {
  claude: {
    label: 'Claude Code',
    roots: [skillRoot('.claude', 'skills')],
    installRoot: skillRoot('.claude', 'skills'),
  },
  codex: {
    label: 'Codex',
    roots: [skillRoot('.codex', 'skills')],
    installRoot: skillRoot('.codex', 'skills'),
  },
  cursor: {
    label: 'Cursor',
    roots: [skillRoot('.cursor', 'skills'), skillRoot('.cursor', 'skills-cursor')],
    installRoot: skillRoot('.cursor', 'skills'),
  },
  trae: {
    label: 'Trae',
    roots: [skillRoot('.trae', 'skills'), skillRoot('.trae', 'builtin_skills')],
    installRoot: skillRoot('.trae', 'skills'),
    builtinRoot: skillRoot('.trae', 'builtin_skills'),
  },
  workbuddy: {
    label: 'Workbuddy',
    roots: [skillRoot('.workbuddy', 'skills')],
    installRoot: skillRoot('.workbuddy', 'skills'),
  },
};

export const ALL_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae', 'workbuddy'];
