import { BrowserWindow, nativeTheme } from 'electron';
import { metaGet, metaSet } from './db.js';
import { SETTING_KEYS, type EffectiveTheme, type Theme } from '../shared/types.js';

// 窗口底色（backgroundColor，防 first-frame 闪烁）：对齐 --bg-0（dark #1a1410 / light #fafafa）。
// Windows 原生 titleBarOverlay 已移除——最小化/最大化/关闭改由 topbar 内的 web 自绘按钮承担
// （见 src/components/TopBar.tsx 的 .window-controls），弹框 .modal-mask 可天然盖住；故此处不再有 caption/symbol。
export function windowBg(eff: EffectiveTheme): string {
  return eff === 'dark' ? '#1a1410' : '#fafafa';
}

/** 读取持久化的主题设置。未设置过时：Windows 默认「跟随系统」，macOS 默认深色（品牌）。 */
export function getThemeSetting(): Theme {
  const v = metaGet(SETTING_KEYS.theme);
  if (v === 'light' || v === 'system') return v;
  return process.platform === 'win32' ? 'system' : 'dark';
}

/** 解析当前有效主题：system → 看 nativeTheme.shouldUseDarkColors。 */
export function effectiveTheme(): EffectiveTheme {
  const s = getThemeSetting();
  if (s === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  return s;
}

/** 更新所有窗口的底色（运行时切主题调用）。 */
function updateWindowColors(eff: EffectiveTheme): void {
  const bg = windowBg(eff);
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    w.setBackgroundColor(bg);
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
