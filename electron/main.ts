import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb } from './db.js';
import { registerIpc } from './ipc.js';
import { refreshMarket } from './market.js';
import { scanAll } from './scan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// vite-plugin-electron 在 dev 时设置这两个变量
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(__dirname, '../dist');

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
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

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    // win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

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
