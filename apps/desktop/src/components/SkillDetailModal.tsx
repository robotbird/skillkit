import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { GlobalRepoSkill, SkillDoc, Tool } from '@shared/types';
import type { SkillGroup } from '../lib/groupSkills';
import ModalPortal from './ModalPortal';
import ToolStack from './ToolStack';
import { GitHubIcon } from './oauth-icons';
import { useI18n } from '../i18n';
import { githubSourceOf } from '../lib/github-source';
import { emojiFor, formatSize, formatTime } from '../lib/format';

/**
 * 详情弹窗的归一化输入：既能由「工具组」（已装到工具的 skill）派生，
 * 也能由「全局仓 skill」（~/.agents/skills，无 tool 归属）派生。
 * 把 SkillGroup 的 primary.* / tools / byTool 扁平成单一对象，避免给全局仓塞假 tool。
 */
export interface SkillDetail {
  name: string;
  description: string | null;
  path: string;
  sizeBytes: number | null;
  mtime: number | null;
  source: string | null; // 喂给 githubSourceOf
  tools: Tool[]; // ToolStack 展示
  builtinTools: Tool[]; // ToolStack 的内置徽章
}

/** 由工具组派生：取 primary 的展示字段 + tools/builtinTools。 */
export function skillDetailFromGroup(g: SkillGroup): SkillDetail {
  return {
    name: g.name,
    description: g.primary.description,
    path: g.primary.path,
    sizeBytes: g.primary.sizeBytes,
    mtime: g.primary.mtime,
    source: g.primary.source,
    tools: g.tools,
    builtinTools: g.tools.filter((t) => g.byTool[t]?.isBuiltin),
  };
}

/** 由全局仓 skill 派生：无工具归属，tools/builtinTools 为空、无 GitHub 来源。 */
export function skillDetailFromGlobalRepo(s: GlobalRepoSkill): SkillDetail {
  return {
    name: s.name,
    description: s.description,
    path: s.path,
    sizeBytes: s.sizeBytes,
    mtime: s.mtime,
    source: null,
    tools: [],
    builtinTools: [],
  };
}

interface Props {
  open: boolean;
  detail: SkillDetail | null;
  onClose: () => void;
}

/**
 * 「我的 skill」详情弹窗：展示 SKILL.md/AGENTS.md 渲染后的正文，
 * 以及本地路径 / 大小；GitHub 来源额外显示作者(owner)与可点击跳转的仓库地址。
 */
export default function SkillDetailModal({ open, detail, onClose }: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [doc, setDoc] = useState<SkillDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 打开 / 切换 skill 时拉取 MD 正文
  useEffect(() => {
    if (!open || !detail) return;
    setLoading(true);
    setDoc(null);
    setError(null);
    setCopied(false);
    window.skillkit
      .readSkillMd(detail.path)
      .then((d) => setDoc(d))
      .catch((e: any) => setError(e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [open, detail?.path]);

  // Esc 关闭（读取中不响应）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, loading, onClose]);

  if (!open || !detail) return null;

  const { tools, builtinTools } = detail;
  const gh = githubSourceOf(detail);

  async function copyPath() {
    if (!detail) return; // 嵌套闭包不继承外层非空收窄，这里补一道
    await navigator.clipboard.writeText(detail.path);
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
              <span className="skill-ico">{emojiFor(detail.name)}</span>
              <h3>{detail.name}</h3>
            </div>
            <ToolStack tools={tools} builtinTools={builtinTools} size="md" />
            {detail.description && <p className="modal-sub">{detail.description}</p>}
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
              <span className="meta-value meta-path" title={detail.path}>
                <code>{detail.path.replace(/^.*\/(\.[^/]+\/)/, '~/$1')}</code>
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
                  onClick={() => void window.skillkit.revealInFinder(detail.path)}
                >
                  {t('skill.openDir')}
                </button>
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">{t('skill.detail.size')}</span>
              <span className="meta-value">
                {detail.sizeBytes != null ? formatSize(detail.sizeBytes) : '—'}
                {detail.mtime != null && (
                  <>
                    <span className="meta-sep">·</span>
                    {t('skill.updated', { time: formatTime(detail.mtime) })}
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
