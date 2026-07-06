import { useEffect, useRef, useState } from 'react';
import type { GlobalRepoSkill } from '@shared/types';
import { emojiFor, formatSize, formatTime, truncate } from '../lib/format';

interface Props {
  skill: GlobalRepoSkill;
  mode: 'grid' | 'list';
  onReveal?: (skill: GlobalRepoSkill) => void;
  onRemove?: (skill: GlobalRepoSkill) => void;
  onInstallTo?: (skill: GlobalRepoSkill) => void;
}

/** 全局仓库（~/.agents/skills）下一条 skill 的卡片。复用 SkillCard 视觉语言，但来源是单一全局位置。 */
export default function GlobalRepoCard({ skill, mode, onReveal, onRemove, onInstallTo }: Props) {
  const reveal = () => onReveal?.(skill);
  const installTo = () => onInstallTo?.(skill);
  const remove = () => onRemove?.(skill);

  if (mode === 'grid') {
    return (
      <article className="skill is-grid">
        <header className="skill-grid-head">
          <div className="skill-ico">{emojiFor(skill.name)}</div>
          <div className="skill-grid-head-right">
            <Kebab onReveal={reveal} onInstallTo={installTo} onRemove={remove} />
          </div>
        </header>
        <div className="skill-name" title={skill.name}>
          {skill.name}
        </div>
        <p className="skill-desc-grid">{truncate(skill.description || '（未提供描述）', 100)}</p>
      </article>
    );
  }

  return (
    <article className="skill is-list">
      <div className="skill-ico">{emojiFor(skill.name)}</div>
      <div className="skill-body">
        <div className="skill-row1">
          <div className="skill-name" title={skill.name}>
            {skill.name}
          </div>
        </div>
        <div className="skill-desc">{skill.description || '（未提供描述）'}</div>
        <div className="skill-meta">
          {skill.sizeBytes != null && (
            <>
              <span>{formatSize(skill.sizeBytes)}</span>
              <span className="dot" />
            </>
          )}
          {skill.mtime != null && (
            <>
              <span>更新于 {formatTime(skill.mtime)}</span>
              <span className="dot" />
            </>
          )}
          <span
            title={skill.path}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
          >
            {skill.path}
          </span>
        </div>
      </div>
      <div className="skill-actions">
        <Kebab onReveal={reveal} onInstallTo={installTo} onRemove={remove} />
      </div>
    </article>
  );
}

function Kebab({
  onReveal,
  onInstallTo,
  onRemove,
}: {
  onReveal: () => void;
  onInstallTo: () => void;
  onRemove: () => void;
}) {
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
        title="更多操作"
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
          <button
            className="kebab-item"
            onClick={() => {
              setOpen(false);
              onReveal();
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
            </svg>
            打开目录
          </button>
          <button
            className="kebab-item"
            onClick={() => {
              setOpen(false);
              onInstallTo();
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M19 13v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5h2v5h10v-5h2zM12 3l5 5h-3v6h-4V8H7l5-5z" />
            </svg>
            安装到工具…
          </button>
          <button
            className="kebab-item danger"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12a2 2 0 01-2 2H9a2 2 0 01-2-2L6 9z"
              />
            </svg>
            从全局仓库移除
          </button>
        </div>
      )}
    </div>
  );
}
