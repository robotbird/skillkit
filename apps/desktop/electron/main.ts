import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { registerIpc } from './ipc.js';
import { refreshMarket } from './market.js';
import { scanAll } from './scan.js';
import { parseShareId } from './share.js';
import { completeOAuth } from './account.js';
import { checkForUpdate } from './updater.js';
import { disposeGithubCache, cleanStaleTmpDirs } from './installer.js';
import { initTheme, effectiveTheme } from './theme.js';
import type { UpdateAvailableInfo, AccountLoginResult } from '../shared/types.js';

// macOS 菜单栏 / Dock 等处显示的应用名（dev 模式下默认会显示 "Electron"）
app.setName('Skillkit');

// 自定义协议 skillkit:// —— 分享页「从 Skillkit 打开」按钮用它唤起本应用
const PROTOCOL = 'skillkit';
// 冷启动时（window 还没建好）收到的深链，先缓存，等页面加载完再发给渲染进程
let pendingDeepLink: string | null = null;
// OAuth 回调(skillkit://auth?code=...)在窗口就绪前到达时缓存，等 did-finish-load 补发
let pendingOAuthResult: AccountLoginResult | null = null;
// 启动期检查到的更新信息（渲染进程就绪前先缓存，就绪后补发）
let pendingUpdate: UpdateAvailableInfo | null = null;

let win: BrowserWindow | null = null;

/** 把 share 深链 id 转发给渲染进程；窗口没建好则缓存到 pendingDeepLink。 */
function deliverDeepLink(input: string) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('skillkit:deep-link', input);
  } else {
    pendingDeepLink = input;
  }
}

/** 把 OAuth 结果推给渲染进程；窗口没建好则缓存到 pendingOAuthResult。 */
function notifyOAuthResult(r: AccountLoginResult) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('account:oauth-result', r);
  } else {
    pendingOAuthResult = r;
  }
}

/** 服务端 OAuth 错误码 -> 桌面文案（与 web 端 i18n 文案对齐）。 */
function mapOAuthError(code: string): string {
  switch (code) {
    case 'oauthDenied':
      return '已取消第三方登录';
    case 'oauthEmailConflict':
      return '该邮箱已用其他方式注册，请先用原方式登录';
    case 'oauthProfile':
      return '无法获取账号信息';
    case 'oauthState':
      return '登录状态校验失败，请重试';
    case 'oauthUnavailable':
      return '该登录方式未启用';
    case 'oauthFailed':
    default:
      return '第三方登录失败，请重试';
  }
}

/** 处理 skillkit://auth?code=<code>（或 ?error=<code>）：换 token 后推结果给渲染进程。 */
async function handleOAuthDeepLink(url: URL) {
  try {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (code) {
      const r = await completeOAuth(code);
      notifyOAuthResult(r);
    } else if (error) {
      notifyOAuthResult({ ok: false, error: mapOAuthError(error) });
    }
  } catch (e) {
    console.error('[oauth] deep-link handling failed', e);
    notifyOAuthResult({ ok: false, error: '第三方登录失败，请重试' });
  }
}

/** 处理 skillkit://install?src=<url>：网站 skill 详情页「从 Skillkit 安装」按钮。
 *  把 src（GitHub 仓库地址）转发给渲染进程，由 InstallView 走「从 GitHub 安装」流程。 */
function handleInstallDeepLink(url: URL) {
  const src = url.searchParams.get('src');
  if (src) deliverDeepLink(src);
}

/**
 * 处理 skillkit:// 深链，按 host 分发：
 * - skillkit://auth?code=<code>  -> 桌面 OAuth 回调（换 token）
 * - skillkit://install?src=<url> -> skill 详情页「从 Skillkit 安装」（转发 GitHub 仓库地址）
 * - skillkit://share/<id>（或裸 id）-> 分享安装（parseShareId 解析）
 * 其余形式忽略。auth/install 分支早于 share，避免其 query 被当作 id 误解析。
 */
function handleDeepLink(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return; // 非法 URL，忽略
  }
  if (parsed.protocol === 'skillkit:' && parsed.host === 'auth') {
    void handleOAuthDeepLink(parsed);
    return;
  }
  if (parsed.protocol === 'skillkit:' && parsed.host === 'install') {
    handleInstallDeepLink(parsed);
    return;
  }
  try {
    const input = parseShareId(rawUrl);
    deliverDeepLink(input);
  } catch {
    // 不是 skillkit://share/<id> 形式，忽略
  }
}

/** 把「发现新版本」推给渲染进程；窗口没建好则缓存到 pendingUpdate。 */
function notifyUpdate(info: UpdateAvailableInfo) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:available', info);
  } else {
    pendingUpdate = info;
  }
}

// macOS：URL scheme 点击由系统派发 open-url，可能在 ready 之前触发，必须尽早注册监听
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// vite-plugin-electron 在 dev 时设置这两个变量
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '../dist');

function createWindow() {
  const isMac = process.platform === 'darwin';
  // 窗口底色按当前有效主题定（dark 暖暗 / light 暖白），防首帧闪烁；
  // 运行时切主题由 theme.ts 的 updateWindowColors 处理。
  const eff = effectiveTheme();
  const bgColor = eff === 'dark' ? '#1a1410' : '#f5f0e8';
  const w = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: bgColor,
    // macOS:hiddenInset + 毛玻璃(左上角红绿灯)。
    // Windows:'hidden' + titleBarOverlay(右上角原生最小化/最大化/关闭),
    //         无框但整条 .topbar 仍可拖拽,居中 tabs 不与右上角按钮重叠。
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    titleBarOverlay: isMac
      ? undefined
      : { color: bgColor, symbolColor: eff === 'dark' ? '#e8dcc8' : '#3a2a1a', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win = w;

  // 冷启动时 open-url 已把 id 缓存到 pendingDeepLink，等渲染进程就绪后补发
  w.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      w.webContents.send('skillkit:deep-link', pendingDeepLink);
      pendingDeepLink = null;
    }
    if (pendingOAuthResult) {
      w.webContents.send('account:oauth-result', pendingOAuthResult);
      pendingOAuthResult = null;
    }
    if (pendingUpdate) {
      w.webContents.send('update:available', pendingUpdate);
      pendingUpdate = null;
    }
  });

  // 在 React 挂载前先设 data-theme，避免亮色用户首帧闪一下深色（useTheme 挂载后会再设一次，幂等）
  w.webContents.on('dom-ready', () => {
    w.webContents
      .executeJavaScript(`document.documentElement.dataset.theme='${effectiveTheme()}'`)
      .catch(() => {});
  });

  if (VITE_DEV_SERVER_URL) {
    w.loadURL(VITE_DEV_SERVER_URL);
    // w.webContents.openDevTools({ mode: 'detach' });
  } else {
    w.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

function bootstrap() {
  app.setAsDefaultProtocolClient(PROTOCOL);

  app.whenReady().then(() => {
    initDb();
    initTheme(); // 在 createWindow 之前：nativeTheme.themeSource + 窗口底色就位
    registerIpc();
    createWindow();

    // 清理上次进程崩溃可能残留的 skillkit-* 临时目录（GitHub/zip 解包）
    setImmediate(() => {
      try { cleanStaleTmpDirs(); } catch (e) { console.error('tmp cleanup failed', e); }
    });

    // 退出时清理 tarball 缓存（list/install 共用的解包结果）
    app.on('will-quit', () => {
      try { disposeGithubCache(); } catch (e) { console.error('dispose cache failed', e); }
    });

    // 启动时后台预热：先扫一次本地，再在后台抓 sitemap（24h 内会跳过）
    setImmediate(() => {
      try { scanAll(); } catch (e) { console.error('startup scan failed', e); }
    });
    setTimeout(() => {
      refreshMarket(false).catch((e) => console.error('market warmup failed', e));
    }, 800);

    // 启动后检查更新（后台，失败静默；发现新版本推给渲染进程）
    setTimeout(() => {
      checkForUpdate()
        .then((r) => {
          if (r.available && r.info) notifyUpdate(r.info);
        })
        .catch((e) => console.error('update check failed', e));
    }, 1500);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// 单实例锁：Windows / Linux 上 URL scheme 会拉起新进程，靠它把 URL 转交给已运行实例。
// macOS 的 URL scheme 走 open-url，不会拉新进程，这里对 macOS 无副作用。
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  bootstrap();
}
