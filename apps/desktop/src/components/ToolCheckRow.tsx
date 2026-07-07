import { ALL_TOOLS, TOOL_LABELS, type Tool } from '@shared/types';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';
import workbuddyIcon from '../assets/agents/workbuddy.svg';
import qoderIcon from '../assets/agents/qoder.svg';

/** 工具 → 图标映射；ToolPicker 与 RepoSkillPicker 共用。 */
export const TOOL_ICON: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
  workbuddy: workbuddyIcon,
  qoder: qoderIcon,
};

interface Props {
  tool: Tool;
  checked: boolean;
  multiple?: boolean; // true=checkbox（多选），false=radio（单选）
  disabled?: boolean; // 置灰不可勾选（如内置不可卸载）
  note?: string; // 置灰时的说明，如「内置·不可卸载」
  onToggle: (tool: Tool) => void;
  parentBusy?: boolean; // 父级 busy 时整体禁用
}

/** 单个工具的勾选行：图标 + 名称 + 状态。ToolPicker / RepoSkillPicker 的工具区共用。 */
export default function ToolCheckRow({
  tool,
  checked,
  multiple = true,
  disabled = false,
  note,
  onToggle,
  parentBusy = false,
}: Props) {
  return (
    <label className={`${checked ? 'checked' : ''}${disabled ? ' is-disabled' : ''}`}>
      <input
        type={multiple ? 'checkbox' : 'radio'}
        name={multiple ? undefined : 'tool-picker'}
        checked={checked}
        onChange={() => onToggle(tool)}
        disabled={parentBusy || disabled}
      />
      <img className="opt-ico" src={TOOL_ICON[tool]} alt="" draggable={false} />
      <span className="tool-name">{TOOL_LABELS[tool]}</span>
      {disabled && note && <span className="opt-note">{note}</span>}
    </label>
  );
}

/** 仅展示「已安装」工具（其 ~/.<tool> 根目录存在）的有序列表，排除指定项。 */
export function visibleToolsOf(installed: Tool[], exclude?: Tool[]): Tool[] {
  const set = new Set(installed);
  return ALL_TOOLS.filter((t) => !exclude?.includes(t) && set.has(t));
}
