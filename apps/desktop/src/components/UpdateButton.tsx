import { useEffect, useState } from 'react';
import type { UpdateAvailableInfo, DownloadProgress } from '@shared/types';
import { useI18n } from '../i18n';
import { formatBytes, formatSpeed } from '../lib/format';

type Phase = 'idle' | 'downloading' | 'done' | 'error';

export default function UpdateButton() {
  const { t } = useI18n();
  const [info, setInfo] = useState<UpdateAvailableInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  useEffect(() => {
    // 挂载时先查一次(覆盖启动期已检查到的),再监听后台完成时的推送
    window.skillkit
      .getUpdateStatus()
      .then((r) => {
        if (r.available && r.info) setInfo(r.info);
      })
      .catch(() => {});
    window.skillkit.onUpdateAvailable((i) => setInfo(i));
    return window.skillkit.onUpdateDownloadProgress((p) => setProgress(p));
  }, []);

  if (!info) return null;

  async function onClick() {
    if (phase === 'downloading' || phase === 'done') return;
    setPhase('downloading');
    setProgress(null);
    try {
      await window.skillkit.applyUpdate();
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }

  // 下载中是否正处在重试退避期
  const isRetry = phase === 'downloading' && progress?.phase === 'retrying';

  // 胶囊里 spinner 旁的紧凑可见文字(下载中展开成胶囊):百分比 + 速度
  let inlineText = '';
  if (phase === 'downloading' && progress) {
    if (progress.phase === 'retrying') {
      inlineText = t('update.retryingShort', {
        attempt: progress.attempt,
        max: progress.maxAttempts,
      });
    } else {
      const pct =
        progress.percent != null
          ? `${Math.floor(progress.percent)}%`
          : formatBytes(progress.transferred);
      inlineText = `${pct} · ${formatSpeed(progress.speedBps)}`;
    }
  }

  // 完整 tooltip(含速度/原因;hover 才见)
  let label: string;
  if (phase === 'downloading') {
    label =
      progress?.phase === 'retrying'
        ? t('update.retrying', {
            attempt: progress.attempt,
            max: progress.maxAttempts,
            reason: progress.message ?? '',
          })
        : progress && progress.percent != null
          ? t('update.progress', {
              percent: Math.floor(progress.percent),
              speed: formatSpeed(progress.speedBps),
              done: formatBytes(progress.transferred),
              total: progress.total ? formatBytes(progress.total) : '?',
            })
          : t('update.downloading');
  } else if (phase === 'done') {
    label = t('update.done', { version: info.version });
  } else if (phase === 'error') {
    label = t('update.error');
  } else {
    label = t('update.idle', { version: info.version, currentVersion: info.currentVersion });
  }

  const cls = `update-btn is-${phase}${isRetry ? ' is-retrying' : ''}`;

  return (
    <button
      className={cls}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={phase === 'downloading' || phase === 'done'}
    >
      {phase === 'downloading' ? (
        <>
          <span className="spinner" />
          {inlineText && <span className="update-progress-text">{inlineText}</span>}
        </>
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
