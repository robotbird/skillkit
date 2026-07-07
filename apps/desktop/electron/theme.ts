import { BrowserWindow, nativeTheme } from 'electron';
import { metaGet, metaSet } from './db.js';
import { SETTING_KEYS, type EffectiveTheme, type Theme } from '../shared/types.js';

// 暖色暗调（默认）与暖色亮调两套窗口底色 / Windows 标题栏控件色。
// 窗口 backgroundColor 在创建时定（防首帧闪烁）；运行时切主题用 setBackgroundColor + setTitleBarOverlay。
const DARK_BG = '#1a1410';
const DARK_SYMBOL = '#e8dcc8';
const LIGHT_BG = '#f5f0e8';
const LIGHT_SYMBOL = '#3a2a1a';

/** 读取持久化的主题设置（默认 dark，与历史一致）。 */
export function getThemeSetting(): Theme {
  const v = metaGet(SETTING_KEYS.theme);
  return v === 'light' || v === 'system' ? v : 'dark';
}

/** 解析当前有效主题：system → 看 nativeTheme.shouldUseDarkColors。 */
export function effectiveTheme(): EffectiveTheme {
  const s = getThemeSetting();
  if (s === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return s;
}

/** 更新所有窗口的底色 / Windows 标题栏控件色（运行时切主题调用）。 */
function updateWindowColors(eff: EffectiveTheme): void {
  const bg = eff === 'dark' ? DARK_BG : LIGHT_BG;
  const symbol = eff === 'dark' ? DARK_SYMBOL : LIGHT_SYMBOL;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    w.setBackgroundColor(bg);
    if (process.platform === 'win32') {
      // setTitleBarOverlay 仅 Windows 有意义（macOS 红绿灯由系统绘制）
      w.setTitleBarOverlay?.({ color: bg, symbolColor: symbol, height: 40 });
    }
  }
}

/** 把有效主题推给所有渲染进程（渲染层据此设 data-theme）。 */
function broadcastTheme(eff: EffectiveTheme): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('theme:effective', eff);
  }
}

/**
 * 应用主题：持久化 → nativeTheme.themeSource → 窗口色 → 推送 effective。
 * 返回解析后的有效主题（供调用方 / IPC 回执用）。
 */
export function applyTheme(setting: Theme): EffectiveTheme {
  metaSet(SETTING_KEYS.theme, setting);
  nativeTheme.themeSource = setting; // 'dark' | 'light' | 'system'
  const eff = effectiveTheme();
  updateWindowColors(eff);
  broadcastTheme(eff);
  return eff;
}

/** 拉取当前设置 + effective（渲染层挂载时一次性查询）。 */
export function getThemeState(): { setting: Theme; effective: EffectiveTheme } {
  return { setting: getThemeSetting(), effective: effectiveTheme() };
}

/**
 * 启动期初始化：在 createWindow 之前调用，使 nativeTheme 与窗口底色就位（防闪烁）。
 * 同时注册 nativeTheme 'changed' 监听 —— 仅 system 模式下 OS 切换外观时需要重算并推送。
 */
export function initTheme(): void {
  nativeTheme.themeSource = getThemeSetting();
  nativeTheme.on('updated', () => {
    // 仅在 system 模式下，OS 外观变化才改变 effective；dark/light 是用户显式选的，不受 OS 影响
    if (getThemeSetting() === 'system') {
      const eff = effectiveTheme();
      updateWindowColors(eff);
      broadcastTheme(eff);
    }
  });
}
