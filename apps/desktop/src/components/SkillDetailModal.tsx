import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SkillDoc } from '@shared/types';
import type { SkillGroup } from '../lib/groupSkills';
import ModalPortal from './ModalPortal';
import ToolStack from './ToolStack';
import { GitHubIcon } from './oauth-icons';
import { useI18n } from '../i18n';
import { githubSourceOf } from '../lib/github-source';
import { emojiFor, formatSize, formatTime } from '../lib/format';

interface Props {
  open: boolean;
  group: SkillGroup | null;
  onClose: () => void;
}

/**
 * 「我的 skill」详情弹窗：展示 SKILL.md/AGENTS.md 渲染后的正文，
 * 以及本地路径 / 大小；GitHub 来源额外显示作者(owner)与可点击跳转的仓库地址。
 */
export default function SkillDetailModal({ open, group, onClose }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<SkillDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 打开 / 切换 skill 时拉取 MD 正文
  useEffect(() => {
    if (!open || !group) return;
    setLoading(true);
    setDoc(null);
    setError(null);
    setCopied(false);
    window.skillkit
      .readSkillMd(group.primary.path)
      .then((d) => setDoc(d))
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, group?.primary.path]);

  // Esc 关闭（读取中不响应）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open || !group) return null;

  const { primary, tools } = group;
  const builtinTools = tools.filter((tool) => group.byTool[tool]?.isBuiltin);
  const gh = githubSourceOf(primary);

  async function copyPath() {
    await navigator.clipboard.writeText(primary.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  // Markdown 里的链接交给系统浏览器打开，避免在渲染层内导航
  const openHref = (href?: string) => {
    if (typeof href === 'string') void window.skillkit.openExternal(href);
  };

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !loading) onClose();
        }}
      >
        <div className="modal skill-detail-modal" role="dialog" aria-modal="true" aria-label={t('skill.detail')}>
          {/* 头 */}
          <div className="skill-detail-head">
            <div className="skill-detail-title">
              <span className="skill-ico">{emojiFor(group.name)}</span>
              <h3>{group.name}</h3>
            </div>
            <ToolStack tools={tools} builtinTools={builtinTools} size="md" />
            {primary.description && <p className="modal-sub">{primary.description}</p>}
          </div>

          {/* 元信息 */}
          <div className="skill-detail-meta">
            {gh && (
              <>
                <div className="meta-row">
                  <span className="meta-label">{t('skill.detail.author')}</span>
                  <span className="meta-value">
                    <GitHubIcon className="meta-gh-ico" />
                    <button
                      className="link-btn"
                      title={`https://github.com/${gh.owner}`}
                      onClick={() => openHref(`https://github.com/${gh.owner}`)}
                    >
                      {gh.owner}
                    </button>
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">{t('skill.detail.address')}</span>
                  <span className="meta-value">
                    <button className="link-btn" title={gh.url} onClick={() => openHref(gh.url)}>
                      {gh.url}
                    </button>
                  </span>
                </div>
              </>
            )}
            <div className="meta-row">
              <span className="meta-label">{t('skill.detail.localPath')}</span>
              <span className="meta-value meta-path" title={primary.path}>
                <code>{primary.path.replace(/^.*\/(\.[^/]+\/)/, '~/$1')}</code>
                <button
                  className="meta-act icon-only"
                  type="button"
                  title={copied ? t('common.copied') : t('skill.detail.copyPath')}
                  aria-label={t('skill.detail.copyPath')}
                  onClick={copyPath}
                >
                  {copied ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z" />
                    </svg>
                  )}
                </button>
                <button
                  className="btn-ghost meta-act"
                  type="button"
                  onClick={() => void window.skillkit.revealInFinder(primary.path)}
                >
                  {t('skill.openDir')}
                </button>
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">{t('skill.detail.size')}</span>
              <span className="meta-value">
                {primary.sizeBytes != null ? formatSize(primary.sizeBytes) : '—'}
                {primary.mtime != null && (
                  <>
                    <span className="meta-sep">·</span>
                    {t('skill.updated', { time: formatTime(primary.mtime) })}
                  </>
                )}
              </span>
            </div>
          </div>

          {/* 正文 */}
          <div className="skill-detail-scroll">
            {loading ? (
              <div className="skill-detail-status">
                <span className="spinner" /> {t('skill.detail.loading')}
              </div>
            ) : error ? (
              <div className="skill-detail-status is-error">{t('skill.detail.readFail', { error })}</div>
            ) : !doc ? (
              <div className="skill-detail-status">{t('skill.detail.noMd')}</div>
            ) : doc.body.trim() === '' ? (
              <div className="skill-detail-status">{t('skill.detail.emptyBody')}</div>
            ) : (
              <div className="skill-md-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node: _node, ...props }) => (
                      <a
                        {...props}
                        onClick={(e) => {
                          e.preventDefault();
                          openHref(props.href);
                        }}
                      />
                    ),
                  }}
                >
                  {doc.body}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* 底栏 */}
          <div className="skill-detail-foot">
            <div className="modal-actions">
              <button className="btn-primary" onClick={onClose} disabled={loading}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
