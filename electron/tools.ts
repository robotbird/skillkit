import path from 'node:path';
import os from 'node:os';
import type { Tool } from '../shared/types.js';

const home = os.homedir();

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
    roots: [path.join(home, '.claude/skills')],
    installRoot: path.join(home, '.claude/skills'),
  },
  codex: {
    label: 'Codex',
    roots: [path.join(home, '.codex/skills')],
    installRoot: path.join(home, '.codex/skills'),
  },
  cursor: {
    label: 'Cursor',
    roots: [
      path.join(home, '.cursor/skills'),
      path.join(home, '.cursor/skills-cursor'),
    ],
    installRoot: path.join(home, '.cursor/skills'),
  },
  trae: {
    label: 'Trae',
    roots: [
      path.join(home, '.trae/skills'),
      path.join(home, '.trae/builtin_skills'),
    ],
    installRoot: path.join(home, '.trae/skills'),
    builtinRoot: path.join(home, '.trae/builtin_skills'),
  },
};

export const ALL_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae'];
