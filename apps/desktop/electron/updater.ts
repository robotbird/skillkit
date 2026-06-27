import { app, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { autoUpdater } from 'electron-updater';
import type { UpdateAvailableInfo } from '../shared/types.js';

const OWNER = 'robotbird';
const REPO = 'skillkit';
const UA = 'skillkit-updater';

// ===== 预留:electron-updater 全自动更新接口(签名后启用) =====
// 当前 App 未签名,macOS 上 electron-updater 的下载/安装会卡在签名校验,
// 故活跃路径走下方的「下载安装包并打开」。等配上 Apple 代码签名后,
// 把 ipc.ts 里 update:apply 的实现从 downloadAndOpenInstaller 切到 performAutoUpdate()
// 即可一键自动升级,UI / IPC 契约不用动。
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

/** 预留:签名后调用 —— 下载 + 退出安装。 */
export async function performAutoUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
  autoUpdater.quitAndInstall();
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}
interface GithubRelease {
  tag_name: string;
  html_url: string;
  assets: GithubAsset[];
}

function parseVer(v: string): number[] {
  return v.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0);
}
function isNewer(a: string, b: string): boolean {
  const aa = parseVer(a);
  const bb = parseVer(b);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const d = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (d > 0) return true;
    if (d < 0) return false;
  }
  return false;
}

/** GET JSON,自动跟随 3xx 重定向(GitHub release 资产会跳转到签名 CDN)。 */
function fetchJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const get = (u: string, depth = 0): void => {
      if (depth > 6) return reject(new Error('too many redirects'));
      https.get(u, { headers: { 'User-Agent': UA, ...headers } }, (res) => {
        const code = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(code)) {
          res.resume();
          const loc = res.headers.location;
          if (loc) return get(loc, depth + 1);
          return reject(new Error('redirect without location'));
        }
        if (code !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${code}`));
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    };
    get(url);
  });
}

/** 按当前平台+架构挑安装包资产;没有则退到 release 页。 */
function pickAsset(assets: GithubAsset[]): { url: string; name: string } | null {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'darwin') {
    const want = arch === 'arm64' ? '-arm64.dmg' : '-x64.dmg';
    const exact = assets.find((a) => a.name.endsWith(want));
    if (exact) return { url: exact.browser_download_url, name: exact.name };
    const anyDmg = assets.find((a) => a.name.endsWith('.dmg'));
    if (anyDmg) return { url: anyDmg.browser_download_url, name: anyDmg.name };
  } else if (plat === 'win32') {
    const exe = assets.find((a) => a.name.endsWith('.exe'));
    if (exe) return { url: exe.browser_download_url, name: exe.name };
  }
  return null;
}

// 最近一次检查的结果(供 applyUpdate 取下载地址,无需渲染进程回传)
let lastInfo: UpdateAvailableInfo | null = null;

/**
 * 检查 robotbird/skillkit 是否有比当前更新的 release。
 * 无 release / 无匹配资产 / 请求失败 都返回 available=false(绝不抛错)。
 */
export async function checkForUpdate(): Promise<{
  available: boolean;
  info: UpdateAvailableInfo | null;
}> {
  const currentVersion = app.getVersion();
  try {
    const rel = (await fetchJson(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
      { Accept: 'application/vnd.github+json' },
    )) as GithubRelease;
    const version = rel.tag_name.replace(/^v/, '');
    if (!isNewer(version, currentVersion)) {
      lastInfo = null;
      return { available: false, info: null };
    }
    const asset = pickAsset(rel.assets);
    const info: UpdateAvailableInfo = {
      version,
      currentVersion,
      releaseUrl: rel.html_url,
      downloadUrl: asset?.url ?? rel.html_url,
      downloadName: asset?.name ?? '',
    };
    lastInfo = info;
    return { available: true, info };
  } catch (e) {
    console.error('[updater] check failed', e);
    lastInfo = null;
    return { available: false, info: null };
  }
}

/** 触发更新:用最近一次检查到的信息下载安装包并打开。 */
export async function applyUpdate(): Promise<string> {
  if (!lastInfo) throw new Error('没有可用的更新信息,请先检查更新');
  return downloadAndOpenInstaller(lastInfo.downloadUrl, lastInfo.downloadName);
}

/** 返回最近一次检查的缓存结果(供渲染进程挂载时查询,避开启动期检查的竞态)。 */
export function getUpdateStatus(): { available: boolean; info: UpdateAvailableInfo | null } {
  return { available: !!lastInfo, info: lastInfo };
}

/** 流式下载(跟随重定向)到目标路径。 */
function downloadToFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string, depth = 0): void => {
      if (depth > 6) {
        file.close();
        return reject(new Error('too many redirects'));
      }
      https.get(u, { headers: { 'User-Agent': UA } }, (res) => {
        const code = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(code)) {
          res.resume();
          const loc = res.headers.location;
          if (loc) return get(loc, depth + 1);
          return reject(new Error('redirect without location'));
        }
        if (code !== 200) {
          res.resume();
          file.close();
          return reject(new Error(`HTTP ${code}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      }).on('error', (e) => {
        file.close();
        reject(e);
      });
    };
    get(url);
  });
}

/**
 * 下载安装包到 ~/Downloads 并打开:
 * macOS 打开 .dmg(挂载 + Finder,用户拖装覆盖);Windows 打开 .exe(启动 nsis 安装器)。
 */
export async function downloadAndOpenInstaller(url: string, filename: string): Promise<string> {
  const dest = path.join(app.getPath('downloads'), filename || 'skillkit-installer');
  await downloadToFile(url, dest);
  await shell.openPath(dest);
  return dest;
}
