import { useState } from 'react';
import { ALL_TOOLS, TOOL_LABELS, type Tool, type InstallResult } from '@shared/types';
import type { ToastState } from '../components/Toast';

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

export default function InstallView({
  toast,
  onInstalled,
}: {
  toast: ToastState;
  onInstalled: () => void;
}) {
  const [targets, setTargets] = useState<Tool[]>(['claude']);
  const [ghUrl, setGhUrl] = useState('');
  const [ghBusy, setGhBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [hint, setHint] = useState<{ msg: string; error?: boolean }>({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });

  function toggle(t: Tool) {
    setTargets((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));
  }

  function pushRecent(name: string, source: string) {
    setRecent((arr) => [{ name, source, at: new Date().toLocaleString('zh-CN') }, ...arr].slice(0, 12));
  }

  async function installGithub() {
    const url = ghUrl.trim();
    if (!url) {
      setHint({ msg: '请输入 GitHub 地址', error: true });
      return;
    }
    if (!targets.length) {
      toast.show('至少选择一个安装目标', 'error');
      return;
    }
    setHint({ msg: '支持 https / git@ / shorthand owner/repo / tree URL' });
    setGhBusy(true);
    try {
      const results = await window.skillzix.installFromGithub(url, targets);
      const okAny = results.some((r) => r.ok);
      toast.show(summarize(results), okAny ? 'info' : 'error', 4000);
      if (okAny) {
        const repoName = url.match(/([^/]+?)(?:\.git)?\/?$/)?.[1] ?? url;
        pushRecent(repoName, url);
        setGhUrl('');
        onInstalled();
      }
    } catch (e: any) {
      toast.show(`安装失败：${e?.message ?? e}`, 'error');
    } finally {
      setGhBusy(false);
    }
  }

  async function pickZip() {
    if (!targets.length) {
      toast.show('至少选择一个安装目标', 'error');
      return;
    }
    setZipBusy(true);
    try {
      const r = await window.skillzix.pickAndInstallZip(targets);
      if (!r) return; // 用户取消
      const okAny = r.some((x) => x.ok);
      toast.show(summarize(r), okAny ? 'info' : 'error', 4000);
      if (okAny) {
        pushRecent(r.find((x) => x.ok)?.path?.split('/').pop() ?? 'zip 包', '本地压缩包');
        onInstalled();
      }
    } catch (e: any) {
      toast.show(`安装失败：${e?.message ?? e}`, 'error');
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <section>
      <div className="view-head">
        <div>
          <h1 className="view-title">安装 Skill</h1>
          <p className="view-sub">从 GitHub 拉取，或上传本地 .zip。会安装到下方勾选的工具。</p>
        </div>
      </div>

      <div className="target-bar">
        <span className="label">安装到：</span>
        {ALL_TOOLS.map((t) => (
          <label key={t} className={`opt${targets.includes(t) ? ' checked' : ''}`}>
            <input
              type="checkbox"
              checked={targets.includes(t)}
              onChange={() => toggle(t)}
            />
            {TOOL_LABELS[t]}
          </label>
        ))}
      </div>

      <div className="install-grid">
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
              onKeyDown={(e) => { if (e.key === 'Enter') installGithub(); }}
            />
            <button className="btn-primary" onClick={installGithub} disabled={ghBusy}>
              {ghBusy ? <><span className="spinner" /> 拉取中</> : '安装'}
            </button>
          </div>
          <div className={`install-hint${hint.error ? ' error' : ''}`}>{hint.msg}</div>
        </article>

        <article className="install-card">
          <div className="install-icon">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path fill="currentColor" d="M19 13v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5h2v5h10v-5h2zM12 3l5 5h-3v6h-4V8H7l5-5z"/>
            </svg>
          </div>
          <h2 className="install-title">上传压缩包</h2>
          <p className="install-desc">点击选择 .zip。zip 内需含一个带 SKILL.md 的目录。</p>
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
              <button className="btn-ghost" onClick={pickZip} disabled={zipBusy}>
                {zipBusy ? <><span className="spinner" /> 解压中</> : '选择文件'}
              </button>
            </div>
          </div>
        </article>
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
    </section>
  );
}
