import type { ReactNode } from 'react';
import KebabMenu, { type KebabItem } from './KebabMenu';
import { truncate } from '../lib/format';

interface Props {
  mode: 'grid' | 'list';
  name: string;
  /** 描述原文；无描述时调用方传占位文案（如「(暂无描述)」）。grid 模式内部截断到 100 字。 */
  description: string;
  /** 卡片左上角 icon 内容（现为 emoji） */
  icon: ReactNode;
  /** grid 模式头部右侧、kebab 之前的内容（如 可更新徽章 / ToolStack） */
  headerExtras?: ReactNode;
  /** list 模式第一行、名称之后的内容（如 ToolStack / 徽章） */
  rowExtras?: ReactNode;
  /** list 模式底部元信息行内容（大小/时间/路径等 span） */
  meta?: ReactNode;
  kebabItems: KebabItem[];
  onOpenDetail?: () => void;
}

/**
 * 卡片壳：「全部」视图（SkillCard）与全局仓库（GlobalRepoCard）共用的 grid/list 双模布局。
 * 布局与交互（点卡片开详情、忽略 kebab/按钮误触）只有这一份；
 * 两个入口只负责把各自的数据映射成 icon / extras / meta / kebabItems，保证视觉天然一致。
 */
export default function SkillCardShell({
  mode,
  name,
  description,
  icon,
  headerExtras,
  rowExtras,
  meta,
  kebabItems,
  onOpenDetail,
}: Props) {
  // 点卡片打开详情；忽略点 kebab 菜单 / 按钮 / 链接，避免误触
  const onCardClick = onOpenDetail
    ? (e: React.MouseEvent<HTMLElement>) => {
        if ((e.target as HTMLElement).closest('button, .kebab, a')) return;
        onOpenDetail();
      }
    : undefined;
  const onCardKey = onOpenDetail
    ? (e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetail();
        }
      }
    : undefined;

  if (mode === 'grid') {
    return (
      <article
        className={`skill is-grid${onOpenDetail ? ' is-clickable' : ''}`}
        onClick={onCardClick}
        onKeyDown={onCardKey}
        role={onOpenDetail ? 'button' : undefined}
        tabIndex={onOpenDetail ? 0 : undefined}
      >
        <header className="skill-grid-head">
          <div className="skill-ico">{icon}</div>
          <div className="skill-grid-head-right">
            {headerExtras}
            <KebabMenu items={kebabItems} />
          </div>
        </header>
        <div className="skill-name" title={name}>
          {name}
        </div>
        <p className="skill-desc-grid">{truncate(description, 100)}</p>
      </article>
    );
  }

  return (
    <article
      className={`skill is-list${onOpenDetail ? ' is-clickable' : ''}`}
      onClick={onCardClick}
      onKeyDown={onCardKey}
      role={onOpenDetail ? 'button' : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
    >
      <div className="skill-ico">{icon}</div>
      <div className="skill-body">
        <div className="skill-row1">
          <div className="skill-name" title={name}>
            {name}
          </div>
          {rowExtras}
        </div>
        <div className="skill-desc">{description}</div>
        {meta && <div className="skill-meta">{meta}</div>}
      </div>
      <div className="skill-actions">
        <KebabMenu items={kebabItems} />
      </div>
    </article>
  );
}
