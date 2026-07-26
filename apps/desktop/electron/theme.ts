import { BrowserWindow, nativeTheme } from 'electron';
import { metaGet, metaSet } from './db.js';
import { SETTING_KEYS, type EffectiveTheme, type Theme } from '../shared/types.js';

// 窗口配色（单一来源：main.ts 建窗 + theme.ts 切主题都走 windowColors）。
// - bg（backgroundColor，防 first-frame 闪烁）：对齐 --bg-0（dark #1a1410 / light #fafafa）。
// - caption（Windows titleBarOverlay 条色）：取右上角原生按钮拼接缝处「顶栏实际透出的显示色」——
//   注意 .bg 不是纯色：底层线性渐变顶部虽是 #2a1d12，但其上还叠了径向暖光
//   `radial-gradient(900px 500px at 100% 0%, rgba(180,120,60,0.22)...)`，正好打在右上角，
//   所以右上角真实显示色比 #2a1d12 暖亮，约 #382717。caption 必须取这个叠加后的色值，
//   否则原生按钮区会显成一块偏冷偏暗的补丁（v0.4.3 的 bug：误用线性顶色 #2a1d12）。
//   light = #fafafa（浅色 .bg 是纯色，无渐变叠加，直接对齐）。
//   caption 是 Electron API 入参，必须 hex 字面量（无法用 CSS 变量）；.bg 渐变/径向改色需同步此处。
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
    // caption #382717 = .bg 右上角真实显示色（#2a1d12 线性顶 + 右上角径向暖光叠加后的结果）。
    return { bg: '#1a1410', caption: '#382717', symbol: '#e8dcc8', height: TITLEBAR_HEIGHT };
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
