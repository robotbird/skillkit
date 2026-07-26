import { BrowserWindow, nativeTheme } from 'electron';
import { metaGet, metaSet } from './db.js';
import { SETTING_KEYS, type EffectiveTheme, type Theme } from '../shared/types.js';

// 窗口配色（单一来源：main.ts 建窗 + theme.ts 切主题都走 windowColors）。
// - bg（backgroundColor，防 first-frame 闪烁）：对齐 --bg-0（dark #1a1410 / light #fafafa）。
// - caption（Windows titleBarOverlay 条色）：取顶栏透出的 .bg 背景色——
//   dark = .bg 渐变顶部 #2a1d12（顶栏实际显示色，与原生窗口按钮无缝融合）；
//   light = #fafafa（中性白，对齐 v2 浅色 --bg-0；旧值 #f5f0e8 是 v1 暖米白，已废弃）。
//   caption 是 Electron API 入参，必须 hex 字面量（无法用 CSS 变量）；.bg 渐变改色需同步此处。
// - symbol：标题栏按钮符号色；light 用近黑 #1a1a1a 对齐浅色态 --ink 中性化。
// - height：= .topbar 高度（60），让原生窗口控制按钮符号与顶栏工具按钮同中心线（垂直对齐）。
const TITLEBAR_HEIGHT = 60;

interface WindowColors {
  bg: string; // 窗口底色（backgroundColor）
  caption: string; // Windows 标题栏条色（titleBarOverlay.color）
  symbol: string; // 标题栏按钮符号色（titleBarOverlay.symbolColor）
  height: number; // 标题栏条高度（= .topbar 高度）
}

/** 按有效主题计算窗口配色。 */
export function windowColors(eff: EffectiveTheme): WindowColors {
  if (eff === 'dark') {
    return { bg: '#1a1410', caption: '#2a1d12', symbol: '#e8dcc8', height: TITLEBAR_HEIGHT };
  }
  return { bg: '#fafafa', caption: '#fafafa', symbol: '#1a1a1a', height: TITLEBAR_HEIGHT };
}

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
  const c = windowColors(eff);
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    w.setBackgroundColor(c.bg);
    if (process.platform === 'win32') {
      // setTitleBarOverlay 仅 Windows 有意义（macOS 红绿灯由系统绘制）
      w.setTitleBarOverlay?.({ color: c.caption, symbolColor: c.symbol, height: c.height });
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
