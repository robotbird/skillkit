import { useEffect, useRef, useState } from 'react';
import type { Tool, InstalledSkill } from '@shared/types';
import { TOOL_LABELS } from '@shared/types';
import ToolBadge from './ToolBadge';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';

const TOOL_ICON: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
};

interface Props {
  skill: InstalledSkill;
  mode: 'grid' | 'list';
  onUninstall?: (tool: Tool, name: string) => void;
  onReveal?: (path: string) => void;
}

function emojiFor(name: string): string {
  const emojis = ['📝', '📄', '🎞️', '📊', '🎨', '🧪', '🔌', '🌈', '🪪', '✨', '🛠️', '🧠', '🔍', '📦', '🎬', '✅', '🛡️', '📈', '🖼️', '🖥️', '🗒️'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return emojis[h % emojis.length];
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ts: number | null): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const day = 24 * 3600 * 1000;
  if (diff < day) return '今天';
  if (diff < 2 * day) return '昨天';
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} 月前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

function KebabMenu({
  canUninstall,
  onReveal,
  onUninstall,
}: {
  canUninstall: boolean;
  onReveal: () => void;
  onUninstall: () => void;
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
    <div className="kebab" ref={wrapRef}>
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
            className="kebab-item danger"
            disabled={!canUninstall}
            onClick={() => {
              setOpen(false);
              if (canUninstall) onUninstall();
            }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12a2 2 0 01-2 2H9a2 2 0 01-2-2L6 9z"
              />
            </svg>
            {canUninstall ? '卸载' : '内置不可卸载'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SkillCard({ skill, mode, onUninstall, onReveal }: Props) {
  const reveal = () => onReveal?.(skill.path);
  const uninstall = () => onUninstall?.(skill.tool, skill.name);
  const canUninstall = !skill.isBuiltin;

  if (mode === 'grid') {
    return (
      <article className="skill is-grid">
        <header className="skill-grid-head">
          <div className="skill-ico">{emojiFor(skill.name)}</div>
          <div className="skill-grid-head-right">
            <span
              className="tool-badge-mini"
              title={TOOL_LABELS[skill.tool] + (skill.isBuiltin ? ' · 内置' : '')}
            >
              <img src={TOOL_ICON[skill.tool]} alt={TOOL_LABELS[skill.tool]} draggable={false} />
            </span>
            <KebabMenu canUninstall={canUninstall} onReveal={reveal} onUninstall={uninstall} />
          </div>
        </header>
        <div className="skill-name" title={skill.name}>
          {skill.name}
        </div>
        <p className="skill-desc-grid">
          {truncate(skill.description || '（未提供描述）', 100)}
        </p>
      </article>
    );
  }

  // list mode
  return (
    <article className="skill is-list">
      <div className="skill-ico">{emojiFor(skill.name)}</div>
      <div className="skill-body">
        <div className="skill-row1">
          <div className="skill-name" title={skill.name}>
            {skill.name}
          </div>
          <ToolBadge tool={skill.tool} />
          {skill.isBuiltin && <span className="skill-tag tag-builtin">内置</span>}
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
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
          >
            {skill.path.replace(/^.*\/(\.[^/]+\/)/, '~/$1')}
          </span>
        </div>
      </div>
      <div className="skill-actions">
        <KebabMenu canUninstall={canUninstall} onReveal={reveal} onUninstall={uninstall} />
      </div>
    </article>
  );
}
