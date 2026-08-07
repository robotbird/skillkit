import { type Tool } from '@shared/types';
import { useToolCatalog } from '../lib/toolCatalog';

interface Props {
  /** 要展示的工具（无需预排序，内部按合并目录顺序排列）。 */
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
  const { allTools, label, icon } = useToolCatalog();
  const ordered = allTools.filter((t) => tools.includes(t));
  const builtinSet = new Set(builtinTools);
  const title = ordered
    .map((t) => label(t) + (builtinSet.has(t) ? ' · 内置' : ''))
    .join('、');

  return (
    <span className={`tool-stack size-${size}`} title={title}>
      {ordered.map((t, i) => (
        <span
          key={t}
          className={`tool-stack-ico${i > 0 ? ' is-overlap' : ''}${builtinSet.has(t) ? ' is-builtin' : ''}`}
        >
          <img src={icon(t)} alt={label(t)} draggable={false} />
        </span>
      ))}
    </span>
  );
}
