import { useEffect, useState } from 'react';
import type { UpdateAvailableInfo } from '@shared/types';
import { useI18n } from '../i18n';

type Phase = 'idle' | 'downloading' | 'done' | 'error';

export default function UpdateButton() {
  const { t } = useI18n();
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
      ? t('update.downloading')
      : phase === 'done'
        ? t('update.done', { version: info.version })
        : phase === 'error'
          ? t('update.error')
          : t('update.idle', { version: info.version, currentVersion: info.currentVersion });

  return (
    <button
      className={`update-btn is-${phase}`}
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
