import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';

/** 菜单项 icon：name → SVG path。所有卡片的 kebab 共用这一份注册表，
 * 「全部」视图与全局仓库视图的菜单 icon 天然一致，避免两处各配一套渐渐漂移。 */
const ICONS = {
  update: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z',
  folder: 'M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z',
  share: 'M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1.9-5.5 4.2-10.9 11-11z',
  copy: 'M16 1H4a2 2 0 00-2 2v14h2V3h12V1zm3 4H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12a2 2 0 01-2 2H9a2 2 0 01-2-2L6 9z',
} as const;

export type KebabIcon = keyof typeof ICONS;

export interface KebabItem {
  key: string;
  icon: KebabIcon;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** 卡片「更多操作」菜单（触发按钮 + 下拉项）。
 * SkillCard 与 GlobalRepoCard 共用同一实现：外点关闭 / Esc 关闭等交互一致，
 * items 顺序即菜单顺序（约定：更新 → 打开目录 → 分享 → 复制到其他工具 → 危险项）。 */
export default function KebabMenu({ items }: { items: KebabItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`kebab${open ? ' is-open' : ''}`} ref={wrapRef}>
      <button
        className="icon-btn"
        title={t('skill.kebabMore')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            fill="currentColor"
            d="M12 6a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4zm0 8a2 2 0 110-4 2 2 0 010 4z"
          />
        </svg>
      </button>
      {open && (
        <div className="kebab-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.key}
              className={`kebab-item${it.danger ? ' danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                if (!it.disabled) it.onSelect();
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d={ICONS[it.icon]} />
              </svg>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
