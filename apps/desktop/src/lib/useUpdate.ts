import { useCallback, useEffect, useState } from 'react';
import type { UpdateAvailableInfo } from '@shared/types';

type Phase = 'idle' | 'downloading' | 'done' | 'error';
type CheckState = 'idle' | 'checking' | 'upToDate' | 'available' | 'error';

/**
 * 自动更新状态。挂载时取启动期缓存 + 监听后台推送；
 * check() 主动请求 GitHub releases；apply() 下载安装包并打开。
 */
export function useUpdate() {
  const [info, setInfo] = useState<UpdateAvailableInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [checkState, setCheckState] = useState<CheckState>('idle');

  useEffect(() => {
    window.skillkit
      .getUpdateStatus()
      .then((r) => {
        if (r.available && r.info) {
          setInfo(r.info);
          setCheckState('available');
        }
      })
      .catch(() => {});
    window.skillkit.onUpdateAvailable((i) => {
      setInfo(i);
      setCheckState('available');
    });
  }, []);

  const check = useCallback(async () => {
    setCheckState('checking');
    try {
      const r = await window.skillkit.checkUpdate();
      if (r.available && r.info) {
        setInfo(r.info);
        setCheckState('available');
      } else {
        setInfo(null);
        setCheckState('upToDate');
      }
    } catch {
      setCheckState('error');
    }
  }, []);

  const apply = useCallback(async () => {
    if (phase === 'downloading' || phase === 'done') return;
    setPhase('downloading');
    try {
      await window.skillkit.applyUpdate();
      setPhase('done');
    } catch {
      setPhase('error');
    }
  }, [phase]);

  return { info, phase, checkState, check, apply };
}
