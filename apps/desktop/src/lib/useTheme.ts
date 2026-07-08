import { useCallback, useEffect, useState } from 'react';
import type { Theme, EffectiveTheme } from '@shared/types';

/**
 * 主题状态 + 应用。挂载时一次性拉取 setting/effective 并设 document.documentElement.dataset.theme；
 * 监听主进程 onThemeChange（system 模式下 OS 切换 / setTheme 后回推）。
 * changeTheme: 持久化 + 通知主进程应用（主进程应用后回推 effective，本 hook 据 onThemeChange 更新）。
 */
export function useTheme() {
  const [setting, setSetting] = useState<Theme>('dark');
  const [effective, setEffective] = useState<EffectiveTheme>('dark');

  useEffect(() => {
    window.skillkit
      .getTheme()
      .then((s) => {
        setSetting(s.setting);
        setEffective(s.effective);
        document.documentElement.dataset.theme = s.effective;
      })
      .catch(() => {});
    window.skillkit.onThemeChange((eff) => {
      setEffective(eff);
      document.documentElement.dataset.theme = eff;
    });
  }, []);

  const changeTheme = useCallback((t: Theme) => {
    setSetting(t);
    window.skillkit.setTheme(t).catch(() => {});
  }, []);

  return { setting, effective, changeTheme };
}

/**
 * 主题同步组件：在应用根部挂一次，副作用是把 data-theme 落到 <html> 并订阅主进程推送。
 * 不渲染任何 UI。与主进程 dom-ready 注入配合（后者在 React 挂载前先设一次防闪烁）。
 */
export function ThemeSync() {
  useTheme();
  return null;
}
