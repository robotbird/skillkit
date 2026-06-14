import { TOOL_LABELS, type Tool } from '@shared/types';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';

const ICONS: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
};

interface Props {
  tool: Tool;
  size?: 'sm' | 'md';
  /** 是否显示文字标签；默认 true */
  showLabel?: boolean;
}

export default function ToolBadge({ tool, size = 'sm', showLabel = true }: Props) {
  return (
    <span className={`tool-badge tool-${tool} size-${size}`} title={TOOL_LABELS[tool]}>
      <img className="tool-badge-ico" src={ICONS[tool]} alt={TOOL_LABELS[tool]} draggable={false} />
      {showLabel && <span className="tool-badge-label">{TOOL_LABELS[tool]}</span>}
    </span>
  );
}
