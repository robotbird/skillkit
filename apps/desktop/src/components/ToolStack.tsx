import { ALL_TOOLS, TOOL_LABELS, type Tool } from '@shared/types';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';
import workbuddyIcon from '../assets/agents/workbuddy.svg';

const ICONS: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
  workbuddy: workbuddyIcon,
};

interface Props {
  /** 要展示的工具（无需预排序，内部按 ALL_TOOLS 顺序排列）。 */
  tools: Tool[];
  /** 标记为内置的工具——这些 icon 加一个小锁角标。 */
  builtinTools?: Tool[];
  size?: 'sm' | 'md';
}

/**
 * 多工具 icon 叠加堆叠。单工具时等价于一个 mini badge（保留原观感），
 * 多工具时微重叠形成「头像组」效果。最多 4 个工具，无需折叠。
 */
export default function ToolStack({ tools, builtinTools = [], size = 'sm' }: Props) {
  const ordered = ALL_TOOLS.filter((t) => tools.includes(t));
  const builtinSet = new Set(builtinTools);
  const title = ordered
    .map((t) => TOOL_LABELS[t] + (builtinSet.has(t) ? ' · 内置' : ''))
    .join('、');

  return (
    <span className={`tool-stack size-${size}`} title={title}>
      {ordered.map((t, i) => (
        <span
          key={t}
          className={`tool-stack-ico${i > 0 ? ' is-overlap' : ''}${builtinSet.has(t) ? ' is-builtin' : ''}`}
        >
          <img src={ICONS[t]} alt={TOOL_LABELS[t]} draggable={false} />
        </span>
      ))}
    </span>
  );
}
