import { useState, useEffect, useRef } from 'react';
import { TOOL_LABELS, type Tool, type InstallResult, type InstallOpts, type GithubSkillsResult, type RepoBatchResult } from '@shared/types';
import type { ToastState } from '../components/Toast';
import ToolPicker from '../components/ToolPicker';
import RepoSkillPicker from '../components/RepoSkillPicker';
import InstallToolGrid from '../components/InstallToolGrid';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';

interface RecentItem {
  name: string;
  source: string;
  at: string;
}

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

function summarize(results: InstallResult[], t: T): string {
  const ok = results.filter((r) => r.ok).map((r) => TOOL_LABELS[r.tool]);
  const fail = results.filter((r) => !r.ok);
  const parts: string[] = [];
  if (ok.length) parts.push(t('inst.sum.installedTo', { tools: ok.join(', ') }));
  if (fail.length) parts.push(t('inst.sum.failed', { detail: fail.map((r) => `${TOOL_LABELS[r.tool]} (${r.error})`).join('; ') }));
  return parts.join('; ') || t('inst.sum.noTool');
}

/** 批量安装汇总：「已安装 N 个 skill 到 K 个工具：<名>…；失败：…」 */
function summarizeBatch(batch: RepoBatchResult[], t: T): string {
  const okSkills = batch.filter((b) => b.results.some((r) => r.ok)).map((b) => b.skillName);
  const failed = batch.flatMap((b) =>
    b.results.filter((r) => !r.ok).map((r) => `${b.skillName}->${TOOL_LABELS[r.tool]} (${r.error})`),
  );
  const parts: string[] = [];
  if (okSkills.length) {
    const tools = [...new Set(batch.flatMap((b) => b.results.filter((r) => r.ok).map((r) => r.tool)))];
    parts.push(t('inst.sumBatch.installed', { skills: okSkills.length, tools: tools.length, names: okSkills.join(', ') }));
  }
  if (failed.length) parts.push(t('inst.sumBatch.failed', { detail: failed.join('; ') }));
  return parts.join('; ') || t('inst.sumBatch.noSkill');
}

type InstallMode = 'share' | 'github' | 'zip';

const MODE_LABELS: Record<InstallMode, MessageKey> = {
  share: 'inst.mode.share',
  github: 'inst.mode.github',
  zip: 'inst.mode.zip',
};

export default function InstallView({
  toast,
  onInstalled,
  pendingShare,
  onPendingConsumed,
}: {
  toast: ToastState;
  onInstalled: () => void;
  pendingShare?: string | null;
  onPendingConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<InstallMode>('share');
  const [ghUrl, setGhUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [selectedTools, setSelectedTools] = useState<Tool[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // 多 skill 仓库：listGithubSkills 的结果 + 弹窗开关
  const [repoPicker, setRepoPicker] = useState<{ open: boolean; result: GithubSkillsResult | null }>({
    open: false,
    result: null,
  });
  // zip：先选文件（存绝对路径），上传完成后再点「安装」选目标工具
  const [zipPath, setZipPath] = useState('');
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [hint, setHint] = useState<{ msg: string; error?: boolean }>({ msg: t('inst.hint.default') });

  // 深链预填用的 ref：规避 setState 异步竞态，确认安装时优先取它
  const pendingShareRef = useRef<string | null>(null);

  // 分享页「从 Skillkit 打开」-> App 传入 share id：切到 share tab、预填输入框；
  // 已选工具则打开接入方式确认，否则 toast 提示先选工具。
  useEffect(() => {
    if (!pendingShare) return;
    setMode('share');
    setShareUrl(pendingShare);
    pendingShareRef.current = pendingShare;
    onPendingConsumed?.();
    if (selectedTools.length === 0) {
      toast.show(t('inst.toast.needTools'), 'error');
      return;
    }
    setPickerOpen(true);
    // selectedTools / toast / t 有意不进 deps：仅在 pendingShare 到达时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShare, onPendingConsumed]);

  function pushRecent(name: string, source: string) {
    setRecent((arr) => [{ name, source, at: new Date().toLocaleString('zh-CN') }, ...arr].slice(0, 12));
  }

  // zip 第一步：弹系统文件框选 zip（仅选文件，不安装）；取消则保持原选择不变
  async function pickZipFile() {
    const p = await window.skillkit.pickZip();
    if (p) setZipPath(p);
  }

  // 点击「安装」：先做当前 tab 的输入校验 + 工具选择校验，通过后弹框选接入方式
  function startInstall() {
    if (mode === 'github' && !ghUrl.trim()) {
      setHint({ msg: t('inst.hint.needGithub'), error: true });
      return;
    }
    if (mode === 'share' && !shareUrl.trim()) {
      toast.show(t('inst.toast.needShare'), 'error');
      return;
    }
    if (mode === 'zip' && !zipPath) {
      toast.show(t('inst.toast.needZip'), 'error');
      return;
    }
    if (selectedTools.length === 0) {
      toast.show(t('inst.toast.needTools'), 'error');
      return;
    }
    if (mode === 'github') {
      // GitHub：先列举仓库内 skill 候选，再决定走单 skill 直装还是多 skill 批量
      void startList();
      return;
    }
    setHint({ msg: t('inst.hint.default') });
    setPickerOpen(true);
  }

  // GitHub 两步流程第一步：列举仓库内 skill 候选
  async function startList() {
    if (!ghUrl.trim()) {
      setHint({ msg: t('inst.hint.needGithub'), error: true });
      return;
    }
    setHint({ msg: t('inst.hint.default') });
    setBusy(true);
    try {
      const res = await window.skillkit.listGithubSkills(ghUrl.trim());
      if (res.kind === 'single') {
        // 单 skill 仓库：走原 ToolPicker 直装路径（handleConfirm 的 github 分支）
        setPickerOpen(true);
      } else if (res.skills.length === 0) {
        toast.show(
          res.isPlugin
            ? t('inst.toast.noSkillPlugin', { hints: res.pluginHints.join(', ') })
            : t('inst.toast.noSkill'),
          'error',
          5000,
        );
      } else {
        // 多 skill：弹 RepoSkillPicker
        setRepoPicker({ open: true, result: res });
      }
    } catch (e: any) {
      toast.show(t('inst.toast.scanFail', { error: e?.message ?? e }), 'error');
    } finally {
      setBusy(false);
    }
  }

  // RepoSkillPicker 确认：批量安装选中的 skill 到页级已选工具
  async function handleRepoConfirm(pickedSubpaths: string[], targets: Tool[], opts: InstallOpts) {
    const result = repoPicker.result;
    if (!result) return;
    const url = ghUrl.trim();
    setBusy(true);
    try {
      const batch = await window.skillkit.installGithubSkillsAt(url, pickedSubpaths, targets, opts);
      const anyOk = batch.some((b) => b.results.some((r) => r.ok));
      toast.show(summarizeBatch(batch, t), anyOk ? 'info' : 'error', 5000);
      if (anyOk) {
        const okNames = batch.filter((b) => b.results.some((r) => r.ok)).map((b) => b.skillName);
        pushRecent(okNames.join(', '), url);
        onInstalled();
      }
    } catch (e: any) {
      toast.show(t('inst.toast.installFail', { error: e?.message ?? e }), 'error');
    } finally {
      setBusy(false);
      setRepoPicker({ open: false, result: null });
    }
  }

  // 在弹框里确认接入方式后真正执行安装（targets 来自页级选择）
  async function handleConfirm(targets: Tool[], opts: InstallOpts) {
    setBusy(true);
    try {
      let results: InstallResult[] | null = null;

      if (mode === 'share') {
        const url = (pendingShareRef.current ?? shareUrl).trim();
        pendingShareRef.current = null;
        results = await window.skillkit.installFromShare(url, targets, opts);
        const okAny = results.some((r) => r.ok);
        toast.show(summarize(results, t), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          pushRecent(results.find((r) => r.ok)?.path?.split('/').pop() ?? t('inst.source.share'), url);
          setShareUrl('');
          onInstalled();
        }
      } else if (mode === 'github') {
        const url = ghUrl.trim();
        results = await window.skillkit.installFromGithub(url, targets, opts);
        const okAny = results.some((r) => r.ok);
        toast.show(summarize(results, t), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          const repoName = url.match(/([^/]+?)(?:\.git)?\/?$/)?.[1] ?? url;
          pushRecent(repoName, url);
          setGhUrl('');
          onInstalled();
        }
      } else {
        // zip：用第一步选好的路径安装到所选工具
        results = await window.skillkit.installFromZip(zipPath, targets, opts);
        const okAny = results.some((x) => x.ok);
        toast.show(summarize(results, t), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          pushRecent(
            results.find((x) => x.ok)?.path?.split('/').pop() ?? zipName,
            t('inst.source.zip'),
          );
          setZipPath('');
          onInstalled();
        }
      }
    } catch (e: any) {
      toast.show(t('inst.toast.installFail', { error: e?.message ?? e }), 'error');
    } finally {
      setBusy(false);
      setPickerOpen(false);
    }
  }

  const zipName = zipPath ? zipPath.split(/[\\/]/).pop() ?? '' : '';

  const pickerSubtitle =
    mode === 'share'
      ? t('inst.pickerSubtitle.share')
      : mode === 'github'
        ? t('inst.pickerSubtitle.github')
        : t('inst.pickerSubtitle.zip');

  return (
    <section>
      <div className="tabs install-tabs">
        {(['share', 'github', 'zip'] as InstallMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            className={`tab${mode === m ? ' is-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {t(MODE_LABELS[m])}
          </button>
        ))}
      </div>

      <div className="install-tools-block">
        <div className="install-tools-title">{t('inst.intro')}</div>
        <InstallToolGrid
          selected={selectedTools}
          onChange={setSelectedTools}
          disabled={busy}
        />
      </div>

      <div className="install-grid is-single">
        {mode === 'share' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1.9-5.5 4.2-10.9 11-11z"/>
              </svg>
            </div>
            <h2 className="install-title">{t('inst.share.title')}</h2>
            <p className="install-desc">{t('inst.share.desc')}</p>
            <div className="install-input">
              <input
                placeholder={t('inst.share.placeholder')}
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startInstall(); }}
              />
              <button className="btn-primary" onClick={startInstall} disabled={busy}>
                {busy ? <><span className="spinner" /> {t('inst.btn.installing')}</> : t('inst.btn.install')}
              </button>
            </div>
            <div className="install-hint">{t('inst.share.hint')}</div>
          </article>
        )}

        {mode === 'github' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.13-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.52-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.15 1.18a10.95 10.95 0 015.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.57.23 2.73.11 3.02.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.26 5.65.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.14 0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z"/>
              </svg>
            </div>
            <h2 className="install-title">{t('inst.github.title')}</h2>
            <p className="install-desc">{t('inst.github.desc')}</p>
            <div className="install-input">
              <input
                placeholder={t('inst.github.placeholder')}
                value={ghUrl}
                onChange={(e) => setGhUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startInstall(); }}
              />
              <button className="btn-primary" onClick={startInstall} disabled={busy}>
                {busy ? <><span className="spinner" /> {t('inst.btn.scanning')}</> : t('inst.btn.install')}
              </button>
            </div>
            <div className={`install-hint${hint.error ? ' error' : ''}`}>{hint.msg}</div>
          </article>
        )}

        {mode === 'zip' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M19 13v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5h2v5h10v-5h2zM12 3l5 5h-3v6h-4V8H7l5-5z"/>
              </svg>
            </div>
            <h2 className="install-title">{t('inst.zip.title')}</h2>
            <p className="install-desc">{t('inst.zip.desc')}</p>
            <div
              className={`dropzone${drag ? ' is-drag' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer?.files?.[0];
                if (!f) return;
                const p = window.skillkit.getDroppedFilePath(f);
                if (!p.toLowerCase().endsWith('.zip')) {
                  toast.show(t('inst.toast.zipOnly'), 'error');
                  return;
                }
                setZipPath(p);
              }}
            >
              <div className="dropzone-inner">
                {zipPath ? (
                  <>
                    <svg viewBox="0 0 24 24" width="28" height="28" style={{ color: '#3ecf8e' }}>
                      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <div className="dropzone-text">{t('inst.zip.uploaded')}</div>
                    <div className="dropzone-file">{zipName}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" onClick={startInstall} disabled={busy}>
                        {busy ? <><span className="spinner" /> {t('inst.btn.installing')}</> : t('inst.btn.install')}
                      </button>
                      <button className="btn-ghost" onClick={pickZipFile} disabled={busy}>
                        {t('inst.btn.resel')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="28" height="28">
                      <path fill="currentColor" d="M12 3l5 5h-3v6h-4V8H7l5-5zM5 18h14v2H5v-2z"/>
                    </svg>
                    <div className="dropzone-text">{t('inst.zip.dropzoneText')}</div>
                    <div className="dropzone-tip">{t('inst.zip.dropzoneTip')}</div>
                    <button className="btn-primary" onClick={pickZipFile} disabled={busy}>
                      {busy ? <><span className="spinner" /> {t('inst.btn.processing')}</> : t('inst.btn.chooseFile')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        )}
      </div>

      <section className="recent">
        <h3>{t('inst.recent.title')}</h3>
        {recent.length === 0 ? (
          <p className="recent-empty" style={{ margin: 0 }}>{t('inst.recent.empty')}</p>
        ) : (
          <ul className="recent-list">
            {recent.map((r, i) => (
              <li key={i}>
                <span style={{ color: 'var(--accent)' }}>●</span>
                <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{r.name}</strong>
                <span style={{ color: 'var(--ink-mute)' }}>· {r.source}</span>
                <span style={{ marginLeft: 'auto', color: 'var(--ink-mute)', fontSize: 11.5 }}>{r.at}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ToolPicker
        open={pickerOpen}
        busy={busy}
        title={t('inst.methodTitle')}
        subtitle={pickerSubtitle}
        fixedTargets={selectedTools}
        lockedScope="global"
        onCancel={() => !busy && setPickerOpen(false)}
        onConfirm={handleConfirm}
      />

      <RepoSkillPicker
        open={repoPicker.open}
        result={repoPicker.result}
        busy={busy}
        fixedTargets={selectedTools}
        lockedScope="global"
        onCancel={() => !busy && setRepoPicker({ open: false, result: null })}
        onConfirm={handleRepoConfirm}
      />
    </section>
  );
}
