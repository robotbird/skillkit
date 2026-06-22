import { useEffect, useRef, useState } from 'react';
import type { SkillGroup } from '../lib/groupSkills';
import ToolStack from './ToolStack';

interface Props {
  group: SkillGroup;
  mode: 'grid' | 'list';
  onUninstall?: (group: SkillGroup) => void;
  onReveal?: (group: SkillGroup) => void;
  onShare?: (group: SkillGroup) => void;
  onCopyTo?: (group: SkillGroup) => void;
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
  onShare,
  onCopyTo,
}: {
  canUninstall: boolean;
  onReveal: () => void;
  onUninstall: () => void;
  onShare?: () => void;
  onCopyTo?: () => void;
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
          {onShare && (
            <button
              className="kebab-item"
              onClick={() => {
                setOpen(false);
                onShare();
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1.9-5.5 4.2-10.9 11-11z"
                />
              </svg>
              分享
            </button>
          )}
          {onCopyTo && (
            <button
              className="kebab-item"
              onClick={() => {
                setOpen(false);
                onCopyTo();
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M16 1H4a2 2 0 00-2 2v14h2V3h12V1zm3 4H8a2 2 0 00-2 2v14a2 2 0 002 2h11a2 2 0 002-2V7a2 2 0 00-2-2zm0 16H8V7h11v14z"
                />
              </svg>
              复制到其他工具
            </button>
          )}
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
            {canUninstall ? '卸载' : '全部为内置'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SkillCard({ group, mode, onUninstall, onReveal, onShare, onCopyTo }: Props) {
  const { primary, tools } = group;
  const builtinTools = tools.filter((t) => group.byTool[t]?.isBuiltin);
  const multi = tools.length > 1;
  // 只要有一个非内置工具就允许卸载（弹窗里再按工具勾选，内置会置灰）
  const canUninstall = tools.some((t) => !group.byTool[t]?.isBuiltin);

  const reveal = () => onReveal?.(group);
  const uninstall = () => onUninstall?.(group);
  const share = onShare ? () => onShare(group) : undefined;
  const copyTo = onCopyTo ? () => onCopyTo(group) : undefined;

  if (mode === 'grid') {
    return (
      <article className="skill is-grid">
        <header className="skill-grid-head">
          <div className="skill-ico">{emojiFor(group.name)}</div>
          <div className="skill-grid-head-right">
            <ToolStack tools={tools} builtinTools={builtinTools} />
            <KebabMenu canUninstall={canUninstall} onReveal={reveal} onUninstall={uninstall} onShare={share} onCopyTo={copyTo} />
          </div>
        </header>
        <div className="skill-name" title={group.name}>
          {group.name}
        </div>
        <p className="skill-desc-grid">
          {truncate(primary.description || '（未提供描述）', 100)}
        </p>
      </article>
    );
  }

  // list mode
  return (
    <article className="skill is-list">
      <div className="skill-ico">{emojiFor(group.name)}</div>
      <div className="skill-body">
        <div className="skill-row1">
          <div className="skill-name" title={group.name}>
            {group.name}
          </div>
          <ToolStack tools={tools} builtinTools={builtinTools} size="md" />
          {multi && <span className="skill-tag tag-multi">{tools.length} 个工具</span>}
          {builtinTools.length > 0 && <span className="skill-tag tag-builtin">含内置</span>}
        </div>
        <div className="skill-desc">{primary.description || '（未提供描述）'}</div>
        <div className="skill-meta">
          {primary.sizeBytes != null && (
            <>
              <span>{formatSize(primary.sizeBytes)}</span>
              <span className="dot" />
            </>
          )}
          {primary.mtime != null && (
            <>
              <span>更新于 {formatTime(primary.mtime)}</span>
              <span className="dot" />
            </>
          )}
          <span
            title={primary.path}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
          >
            {primary.path.replace(/^.*\/(\.[^/]+\/)/, '~/$1')}
          </span>
        </div>
      </div>
      <div className="skill-actions">
        <KebabMenu canUninstall={canUninstall} onReveal={reveal} onUninstall={uninstall} onShare={share} onCopyTo={copyTo} />
      </div>
    </article>
  );
}
