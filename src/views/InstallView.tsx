import { useState } from 'react';
import { TOOL_LABELS, type Tool, type InstallResult } from '@shared/types';
import type { ToastState } from '../components/Toast';
import ToolPicker from '../components/ToolPicker';

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

type InstallMode = 'share' | 'github' | 'zip';

const MODE_LABELS: Record<InstallMode, string> = {
  share: '分享链接',
  github: 'GitHub',
  zip: '上传压缩包',
};

export default function InstallView({
  toast,
  onInstalled,
}: {
  toast: ToastState;
  onInstalled: () => void;
}) {
  const [mode, setMode] = useState<InstallMode>('share');
  const [ghUrl, setGhUrl] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [hint, setHint] = useState<{ msg: string; error?: boolean }>({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });

  function pushRecent(name: string, source: string) {
    setRecent((arr) => [{ name, source, at: new Date().toLocaleString('zh-CN') }, ...arr].slice(0, 12));
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
    setHint({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });
    setPickerOpen(true);
  }

  // 在弹框里确认目标工具后真正执行安装
  async function handleConfirm(targets: Tool[]) {
    setBusy(true);
    try {
      let results: InstallResult[] | null = null;

      if (mode === 'share') {
        const url = shareUrl.trim();
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
        // zip：确认工具后会再弹系统文件选择框
        const r = await window.skillkit.pickAndInstallZip(targets);
        if (!r) {
          toast.show('已取消选择文件', 'info', 2000);
          return;
        }
        results = r;
        const okAny = results.some((x) => x.ok);
        toast.show(summarize(results), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          pushRecent(results.find((x) => x.ok)?.path?.split('/').pop() ?? 'zip 包', '本地压缩包');
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

  const pickerSubtitle =
    mode === 'share'
      ? '将把分享链接对应的 skill 安装到所选工具。'
      : mode === 'github'
        ? '将从 GitHub 拉取并复制到所选工具的 skills 目录。'
        : '选择本地 zip 后，安装到所选工具。';

  return (
    <section>
      <div className="view-head">
        <div>
          <h1 className="view-title">安装 Skill</h1>
          <p className="view-sub">选择来源并安装；安装时再选择要安装到的工具。</p>
        </div>
      </div>

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
                placeholder="http://.../share/xxxxxx  或  短链 ID"
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
                {busy ? <><span className="spinner" /> 拉取中</> : '安装'}
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
                // electron 不能直接读 file://，告知用户用按钮选取
                toast.show('请使用下方按钮选择 zip 文件以保留路径权限');
              }}
            >
              <div className="dropzone-inner">
                <svg viewBox="0 0 24 24" width="28" height="28">
                  <path fill="currentColor" d="M12 3l5 5h-3v6h-4V8H7l5-5zM5 18h14v2H5v-2z"/>
                </svg>
                <div className="dropzone-text">选择本地 .zip 文件</div>
                <button className="btn-primary" onClick={startInstall} disabled={busy}>
                  {busy ? <><span className="spinner" /> 处理中</> : '选择文件并安装'}
                </button>
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
    </section>
  );
}
