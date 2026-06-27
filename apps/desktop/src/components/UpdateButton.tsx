import { useEffect, useState } from 'react';
import type { UpdateAvailableInfo } from '@shared/types';

// Windows 顶栏右上角有原生窗口控制按钮(titleBarOverlay,约 138px),按钮要让开;
// macOS 右上角无控件,贴边即可。
const isWindows =
  typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent);

type Phase = 'idle' | 'downloading' | 'done' | 'error';

export default function UpdateButton() {
  const [info, setInfo] = useState<UpdateAvailableInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    // 挂载时先查一次(覆盖启动期已检查到的),再监听后台完成时的推送
    window.skillkit
      .getUpdateStatus()
      .then((r) => {
        if (r.available && r.info) setInfo(r.info);
      })
      .catch(() => {});
    window.skillkit.onUpdateAvailable((i) => setInfo(i));
  }, []);

  if (!info) return null;

  async function onClick() {
    if (phase === 'downloading' || phase === 'done') return;
    setPhase('downloading');
    try {
      await window.skillkit.applyUpdate();
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }

  const label =
    phase === 'downloading'
      ? '正在下载更新…'
      : phase === 'done'
        ? `已下载 v${info.version}，请在弹出的安装窗口完成更新（安装完会替换当前版本）`
        : phase === 'error'
          ? '下载失败，点此重试（或稍后再试）'
          : `发现新版本 v${info.version}（当前 v${info.currentVersion}），点此下载并更新`;

  return (
    <button
      className={`update-btn is-${phase}`}
      style={{ right: isWindows ? 150 : 16 }}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={phase === 'downloading' || phase === 'done'}
    >
      {phase === 'downloading' ? (
        <span className="spinner" />
      ) : phase === 'done' ? (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            fill="currentColor"
            d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
          />
        </svg>
      ) : phase === 'error' ? (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path
            fill="currentColor"
            d="M12 3a1 1 0 011 1v8.59l2.3-2.3a1 1 0 011.4 1.42l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.42l2.3 2.3V4a1 1 0 011-1zM5 19a1 1 0 011-1h12a1 1 0 010 2H6a1 1 0 01-1-1z"
          />
        </svg>
      )}
      {phase === 'idle' && <span className="update-dot" />}
    </button>
  );
}
