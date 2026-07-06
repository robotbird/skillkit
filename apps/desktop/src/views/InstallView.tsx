import { useState, useEffect, useRef } from 'react';
import { TOOL_LABELS, type Tool, type InstallResult, type GithubSkillsResult, type RepoBatchResult } from '@shared/types';
import type { ToastState } from '../components/Toast';
import ToolPicker from '../components/ToolPicker';
import RepoSkillPicker from '../components/RepoSkillPicker';

interface RecentItem {
  name: string;
  source: string;
  at: string;
}

function summarize(results: InstallResult[]): string {
  const ok = results.filter((r) => r.ok).map((r) => TOOL_LABELS[r.tool]);
  const fail = results.filter((r) => !r.ok);
  const parts: string[] = [];
  if (ok.length) parts.push(`已安装到：${ok.join('、')}`);
  if (fail.length) parts.push(`失败：${fail.map((r) => `${TOOL_LABELS[r.tool]}（${r.error}）`).join('；')}`);
  return parts.join('；') || '没有任何工具被处理';
}

/** 批量安装汇总：「已安装 N 个 skill 到 K 个工具：<名>…；失败：…」 */
function summarizeBatch(batch: RepoBatchResult[]): string {
  const okSkills = batch.filter((b) => b.results.some((r) => r.ok)).map((b) => b.skillName);
  const failed = batch.flatMap((b) =>
    b.results.filter((r) => !r.ok).map((r) => `${b.skillName}→${TOOL_LABELS[r.tool]}（${r.error}）`),
  );
  const parts: string[] = [];
  if (okSkills.length) {
    const tools = [...new Set(batch.flatMap((b) => b.results.filter((r) => r.ok).map((r) => r.tool)))];
    parts.push(`已安装 ${okSkills.length} 个 skill 到 ${tools.length} 个工具：${okSkills.join('、')}`);
  }
  if (failed.length) parts.push(`失败：${failed.join('；')}`);
  return parts.join('；') || '没有任何 skill 被处理';
}

type InstallMode = 'share' | 'github' | 'zip';

const MODE_LABELS: Record<InstallMode, string> = {
  share: '分享链接',
  github: 'GitHub',
  zip: '上传压缩包',
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
  const [mode, setMode] = useState<InstallMode>('share');
  const [ghUrl, setGhUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
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
  const [hint, setHint] = useState<{ msg: string; error?: boolean }>({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });

  // 深链预填用的 ref：规避 setState 异步竞态，确认安装时优先取它
  const pendingShareRef = useRef<string | null>(null);

  // 分享页「从 Skillkit 打开」→ App 传入 share id：切到 share tab、预填输入框、直接弹工具选择器
  useEffect(() => {
    if (!pendingShare) return;
    setMode('share');
    setShareUrl(pendingShare);
    pendingShareRef.current = pendingShare;
    onPendingConsumed?.();
    setPickerOpen(true);
  }, [pendingShare, onPendingConsumed]);

  function pushRecent(name: string, source: string) {
    setRecent((arr) => [{ name, source, at: new Date().toLocaleString('zh-CN') }, ...arr].slice(0, 12));
  }

  // zip 第一步：弹系统文件框选 zip（仅选文件，不安装）；取消则保持原选择不变
  async function pickZipFile() {
    const p = await window.skillkit.pickZip();
    if (p) setZipPath(p);
  }

  // 点击「安装」：先做当前 tab 的输入校验，通过后弹框选择目标工具
  function startInstall() {
    if (mode === 'github' && !ghUrl.trim()) {
      setHint({ msg: '请输入 GitHub 地址', error: true });
      return;
    }
    if (mode === 'share' && !shareUrl.trim()) {
      toast.show('请输入分享链接', 'error');
      return;
    }
    if (mode === 'zip' && !zipPath) {
      toast.show('请先选择 zip 文件', 'error');
      return;
    }
    if (mode === 'github') {
      // GitHub：先列举仓库内 skill 候选，再决定走单 skill 直装还是多 skill 批量
      void startList();
      return;
    }
    setHint({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });
    setPickerOpen(true);
  }

  // GitHub 两步流程第一步：列举仓库内 skill 候选
  async function startList() {
    if (!ghUrl.trim()) {
      setHint({ msg: '请输入 GitHub 地址', error: true });
      return;
    }
    setHint({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });
    setBusy(true);
    try {
      const res = await window.skillkit.listGithubSkills(ghUrl.trim());
      if (res.kind === 'single') {
        // 单 skill 仓库：走原 ToolPicker 直装路径（handleConfirm 的 github 分支）
        setPickerOpen(true);
      } else if (res.skills.length === 0) {
        toast.show(
          res.isPlugin
            ? `未扫到 skill；该仓库似乎是 plugin 框架（${res.pluginHints.join('、')}），建议用对应 harness 的原生 plugin 安装`
            : '未扫到任何带有效 frontmatter 的 SKILL.md / AGENTS.md',
          'error',
          5000,
        );
      } else {
        // 多 skill：弹 RepoSkillPicker
        setRepoPicker({ open: true, result: res });
      }
    } catch (e: any) {
      toast.show(`扫描失败：${e?.message ?? e}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  // RepoSkillPicker 确认：批量安装选中的 skill 到所选工具
  async function handleRepoConfirm(pickedSubpaths: string[], targets: Tool[]) {
    const result = repoPicker.result;
    if (!result) return;
    const url = ghUrl.trim();
    setBusy(true);
    try {
      const batch = await window.skillkit.installGithubSkillsAt(url, pickedSubpaths, targets);
      const anyOk = batch.some((b) => b.results.some((r) => r.ok));
      toast.show(summarizeBatch(batch), anyOk ? 'info' : 'error', 5000);
      if (anyOk) {
        const okNames = batch.filter((b) => b.results.some((r) => r.ok)).map((b) => b.skillName);
        pushRecent(okNames.join('、'), url);
        onInstalled();
      }
    } catch (e: any) {
      toast.show(`安装失败：${e?.message ?? e}`, 'error');
    } finally {
      setBusy(false);
      setRepoPicker({ open: false, result: null });
    }
  }

  // 在弹框里确认目标工具后真正执行安装
  async function handleConfirm(targets: Tool[]) {
    setBusy(true);
    try {
      let results: InstallResult[] | null = null;

      if (mode === 'share') {
        const url = (pendingShareRef.current ?? shareUrl).trim();
        pendingShareRef.current = null;
        results = await window.skillkit.installFromShare(url, targets);
        const okAny = results.some((r) => r.ok);
        toast.show(summarize(results), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          pushRecent(results.find((r) => r.ok)?.path?.split('/').pop() ?? '分享链接', url);
          setShareUrl('');
          onInstalled();
        }
      } else if (mode === 'github') {
        const url = ghUrl.trim();
        results = await window.skillkit.installFromGithub(url, targets);
        const okAny = results.some((r) => r.ok);
        toast.show(summarize(results), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          const repoName = url.match(/([^/]+?)(?:\.git)?\/?$/)?.[1] ?? url;
          pushRecent(repoName, url);
          setGhUrl('');
          onInstalled();
        }
      } else {
        // zip：用第一步选好的路径安装到所选工具
        results = await window.skillkit.installFromZip(zipPath, targets);
        const okAny = results.some((x) => x.ok);
        toast.show(summarize(results), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          pushRecent(
            results.find((x) => x.ok)?.path?.split('/').pop() ?? zipName,
            '本地压缩包',
          );
          setZipPath('');
          onInstalled();
        }
      }
    } catch (e: any) {
      toast.show(`安装失败：${e?.message ?? e}`, 'error');
    } finally {
      setBusy(false);
      setPickerOpen(false);
    }
  }

  const zipName = zipPath ? zipPath.split(/[\\/]/).pop() ?? '' : '';

  const pickerSubtitle =
    mode === 'share'
      ? '将把分享链接对应的 skill 安装到所选工具。'
      : mode === 'github'
        ? '将从 GitHub 拉取并复制到所选工具的 skills 目录。'
        : '将把所选 zip 安装到所选工具。';

  return (
    <section>
      <p className="view-intro">选择来源并安装；安装时再选择要安装到的工具。</p>

      <div className="tabs install-tabs">
        {(['share', 'github', 'zip'] as InstallMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            className={`tab${mode === m ? ' is-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="install-grid is-single">
        {mode === 'share' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1.9-5.5 4.2-10.9 11-11z"/>
              </svg>
            </div>
            <h2 className="install-title">从分享链接安装</h2>
            <p className="install-desc">粘贴其他用户分享的短链或完整 URL，即可安装 skill。</p>
            <div className="install-input">
              <input
                placeholder="http://skillkit.net/share/xxxxxx  或  短链 ID"
                value={shareUrl}
                onChange={(e) => setShareUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startInstall(); }}
              />
              <button className="btn-primary" onClick={startInstall} disabled={busy}>
                {busy ? <><span className="spinner" /> 安装中</> : '安装'}
              </button>
            </div>
            <div className="install-hint">链接 7 天内有效，过期后无法安装</div>
          </article>
        )}

        {mode === 'github' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1.17-.02-2.13-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.74 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.52-2.55-.29-5.24-1.27-5.24-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.15 1.18a10.95 10.95 0 015.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.57.23 2.73.11 3.02.74.8 1.18 1.82 1.18 3.07 0 4.4-2.69 5.36-5.26 5.65.41.35.78 1.05.78 2.12 0 1.53-.01 2.77-.01 3.14 0 .31.21.68.8.56 4.56-1.52 7.85-5.83 7.85-10.91C23.5 5.65 18.35.5 12 .5z"/>
              </svg>
            </div>
            <h2 className="install-title">从 GitHub 安装</h2>
            <p className="install-desc">输入仓库地址或 tree URL，将拉取目标目录作为 skill。</p>
            <div className="install-input">
              <input
                placeholder="owner/repo  或  https://github.com/owner/repo/tree/main/skill"
                value={ghUrl}
                onChange={(e) => setGhUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startInstall(); }}
              />
              <button className="btn-primary" onClick={startInstall} disabled={busy}>
                {busy ? <><span className="spinner" /> 扫描中</> : '安装'}
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
            <h2 className="install-title">上传压缩包</h2>
            <p className="install-desc">选择本地 .zip 文件。zip 内需含一个带 SKILL.md 的目录。</p>
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
                  toast.show('只支持 .zip 压缩包', 'error');
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
                    <div className="dropzone-text">上传完成</div>
                    <div className="dropzone-file">{zipName}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" onClick={startInstall} disabled={busy}>
                        {busy ? <><span className="spinner" /> 安装中</> : '安装'}
                      </button>
                      <button className="btn-ghost" onClick={pickZipFile} disabled={busy}>
                        重新选择
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="28" height="28">
                      <path fill="currentColor" d="M12 3l5 5h-3v6h-4V8H7l5-5zM5 18h14v2H5v-2z"/>
                    </svg>
                    <div className="dropzone-text">选择本地 .zip 文件</div>
                    <div className="dropzone-tip">也可将 .zip 直接拖入此处</div>
                    <button className="btn-primary" onClick={pickZipFile} disabled={busy}>
                      {busy ? <><span className="spinner" /> 处理中</> : '选择文件'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        )}
      </div>

      <section className="recent">
        <h3>最近安装</h3>
        {recent.length === 0 ? (
          <p className="recent-empty" style={{ margin: 0 }}>暂无记录</p>
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
        subtitle={pickerSubtitle}
        defaultSelected={['claude']}
        onCancel={() => !busy && setPickerOpen(false)}
        onConfirm={handleConfirm}
      />

      <RepoSkillPicker
        open={repoPicker.open}
        result={repoPicker.result}
        busy={busy}
        onCancel={() => !busy && setRepoPicker({ open: false, result: null })}
        onConfirm={handleRepoConfirm}
      />
    </section>
  );
}
