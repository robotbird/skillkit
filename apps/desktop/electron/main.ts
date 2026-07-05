import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { registerIpc } from './ipc.js';
import { refreshMarket } from './market.js';
import { scanAll } from './scan.js';
import { parseShareId } from './share.js';
import { checkForUpdate } from './updater.js';
import { disposeGithubCache, cleanStaleTmpDirs } from './installer.js';
import type { UpdateAvailableInfo } from '../shared/types.js';

// macOS 菜单栏 / Dock 等处显示的应用名（dev 模式下默认会显示 "Electron"）
app.setName('Skillkit');

// 自定义协议 skillkit:// —— 分享页「从 Skillkit 打开」按钮用它唤起本应用
const PROTOCOL = 'skillkit';
// 冷启动时（window 还没建好）收到的深链，先缓存，等页面加载完再发给渲染进程
let pendingDeepLink: string | null = null;
// 启动期检查到的更新信息（渲染进程就绪前先缓存，就绪后补发）
let pendingUpdate: UpdateAvailableInfo | null = null;

let win: BrowserWindow | null = null;

/**
 * 处理 skillkit://share/<id> 深链：解析出 share id，转发给渲染进程去走「从分享链接安装」流程。
 * parseShareId 对整条 `skillkit://share/<id>` 也能匹配出 id；非法 URL 抛错被吞掉。
 */
function handleDeepLink(url: string) {
  try {
    const input = parseShareId(url);
    if (win && !win.isDestroyed()) {
      win.webContents.send('skillkit:deep-link', input);
    } else {
      pendingDeepLink = input;
    }
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
  const w = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#1a1410',
    // macOS:hiddenInset + 毛玻璃(左上角红绿灯)。
    // Windows:'hidden' + titleBarOverlay(右上角原生最小化/最大化/关闭),
    //         无框但整条 .topbar 仍可拖拽,居中 tabs 不与右上角按钮重叠。
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    titleBarOverlay: isMac
      ? undefined
      : { color: '#1a1410', symbolColor: '#e8dcc8', height: 40 },
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
    if (pendingUpdate) {
      w.webContents.send('update:available', pendingUpdate);
      pendingUpdate = null;
    }
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
