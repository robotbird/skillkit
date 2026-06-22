import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { registerIpc } from './ipc.js';
import { refreshMarket } from './market.js';
import { scanAll } from './scan.js';
import { parseShareId } from './share.js';

// macOS 菜单栏 / Dock 等处显示的应用名（dev 模式下默认会显示 "Electron"）
app.setName('Skillkit');

// 自定义协议 skillkit:// —— 分享页「从 Skillkit 打开」按钮用它唤起本应用
const PROTOCOL = 'skillkit';
// 冷启动时（window 还没建好）收到的深链，先缓存，等页面加载完再发给渲染进程
let pendingDeepLink: string | null = null;

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
  const w = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1410',
    vibrancy: 'under-window',
    visualEffectState: 'active',
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

    // 启动时后台预热：先扫一次本地，再在后台抓 sitemap（24h 内会跳过）
    setImmediate(() => {
      try { scanAll(); } catch (e) { console.error('startup scan failed', e); }
    });
    setTimeout(() => {
      refreshMarket(false).catch((e) => console.error('market warmup failed', e));
    }, 800);

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
