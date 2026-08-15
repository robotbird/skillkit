import { app, shell, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { spawn } from 'node:child_process';
import type { ClientRequest } from 'node:http';
import { autoUpdater, type ProgressInfo } from 'electron-updater';
import type { UpdateAvailableInfo, DownloadProgress } from '../shared/types.js';

const OWNER = 'robotbird';
const REPO = 'skillkit';
const UA = 'skillkit-updater';

// ===== electron-updater 静默增量更新 =====
// app 进程内下载新版本再安装:不经浏览器下载,替换出的新 app 不带 com.apple.quarantine,
// 老用户升级全程免 xattr。下载/校验环节未签名也能跑(仅 log 警告);**安装环节分平台**:
// - Windows(NSIS):quitAndInstall 静默装,未签名可用;配看门狗,卡住即降级。
// - macOS:Squirrel.Mac 要求 app 有代码签名,未签名下 quitAndInstall 必失败且是静默失败
//   (ShipIt 起来校验不过就退出,报错没人接)——所以 mac 绕开 Squirrel 走自替换脚本
//   (installViaSelfReplace):detached 脚本等本进程退出后 ditto 解包、原子换 .app、重启。
// 任一环节失败则降级到 downloadAndOpenInstaller(下载 dmg/exe 手动装,会撞 quarantine,但保底可用)。
// feed(latest-mac.yml/latest.yml)由 CI 上传到 release,见 .github/workflows/build.yml。
// 差分下载:mac/win 均默认开启 blockmap 差分,但要求缓存里有上一次更新的包
// (~/Library/Caches/desktop-updater/update.zip);首次从安装包装起的更新必然全量。
autoUpdater.autoDownload = false; // 手动触发 downloadUpdate,先广播进度再下载
autoUpdater.autoInstallOnAppQuit = false; // 手动控制安装时机,留时间给 UI 显示完成态

/** quitAndInstall 后 app 迟迟不退出 → 视为安装驱动失败,降级手动安装。 */
const INSTALL_WATCHDOG_MS = 8_000;

/**
 * 静默增量更新:autoUpdater 走 feed 发现→下载→安装,进度转成 DownloadProgress 广播。
 * 失败则 reject,由 applyUpdate 决定是否降级到手动安装。返回 'auto' 表示走了静默路径。
 */
export async function performAutoUpdate(): Promise<string> {
  try {
    await runAutoUpdater();
    return 'auto';
  } catch (e) {
    // 静默更新失败(feed 缺失/网络/校验/安装超时)→ 降级下载安装包打开,保底可用
    console.warn('[updater] 静默更新失败,降级为下载安装包打开', e);
    if (!lastInfo?.downloadUrl) throw e;
    return downloadAndOpenInstaller(lastInfo.downloadUrl, lastInfo.downloadName);
  }
}

/**
 * 驱动 electron-updater 完成一次「检查→下载→安装」;autoDownload/autoInstall 关闭,手动控制每步。
 * 进度与错误经事件转成 DownloadProgress 广播;任一阶段 error → reject(含安装阶段:
 * error 监听保持挂载到 Promise 落定,不再提前摘除——否则 quitAndInstall 的失败会被静默吞掉,
 * UI 停在 100% 装死)。mac 走自替换,win 走 quitAndInstall + 看门狗。
 */
function runAutoUpdater(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let downloadedZip: string | null = null; // downloadUpdate() 落盘路径(mac 自替换要用)
    let watchdog: NodeJS.Timeout | null = null;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      autoUpdater.off('error', onError);
      autoUpdater.off('update-downloaded', onDownloaded);
      autoUpdater.off('download-progress', onProgress);
      if (watchdog) clearTimeout(watchdog);
      fn();
    };
    const onError = (e: unknown): void =>
      finish(() => reject(e instanceof Error ? e : new Error(String(e))));
    const onProgress = (p: ProgressInfo): void => {
      broadcastProgress({
        attempt: 1,
        maxAttempts: 1,
        transferred: p.transferred,
        total: p.total,
        percent: p.percent,
        speedBps: p.bytesPerSecond,
        phase: 'downloading',
      });
    };
    const onDownloaded = (): void => {
      // 终态补发 100%,让 UI 落到完成态
      broadcastProgress({
        attempt: 1,
        maxAttempts: 1,
        transferred: 0,
        total: null,
        percent: 100,
        speedBps: 0,
        phase: 'downloading',
      });
      // 给 UI 一瞬显示「完成」再进入安装
      setTimeout(() => {
        try {
          if (process.platform === 'darwin') {
            // mac 未签名:Squirrel 装不了,自替换脚本接管;脚本拉起失败 → reject 降级
            if (!downloadedZip) throw new Error('未拿到更新包落盘路径');
            installViaSelfReplace(downloadedZip);
            finish(() => resolve());
            app.quit(); // 脚本在等本进程退出,退出后换包并重启
          } else {
            // Windows:quitAndInstall 静默装。error 监听仍挂载,安装报错 → reject 降级;
            // 再加看门狗:8s 内 app 没退出说明安装根本没驱动起来(史上就是这种静默失败),同样降级。
            watchdog = setTimeout(() => {
              finish(() => reject(new Error(`退出安装未在 ${INSTALL_WATCHDOG_MS / 1000}s 内启动`)));
            }, INSTALL_WATCHDOG_MS);
            autoUpdater.quitAndInstall();
          }
        } catch (e) {
          finish(() => reject(e instanceof Error ? e : new Error(String(e))));
        }
      }, 600);
    };

    autoUpdater.on('error', onError);
    autoUpdater.on('update-downloaded', onDownloaded);
    autoUpdater.on('download-progress', onProgress);

    autoUpdater
      .checkForUpdates()
      .then((r) => {
        // autoDownload=false:checkForUpdates 只检查不下载;有更新则手动触发下载
        if (!r?.updateInfo) {
          finish(() =>
            reject(new Error('electron-updater 未发现可更新版本(feed 缺失或已是最新)')),
          );
          return;
        }
        // 记下落盘路径(mac 自替换要用),后续由 update-downloaded/error 事件驱动
        return autoUpdater.downloadUpdate().then((files: string[]) => {
          downloadedZip = files?.[0] ?? null;
        });
      })
      .catch(onError);
  });
}

/**
 * mac 未签名自替换安装:拉起一个 detached shell 脚本后立刻返回(配合随后的 app.quit())。
 * 脚本等本进程退干净 → ditto 解包下载好的 zip → 原子换掉当前 .app(先挪旧包再就位,失败回滚)
 * → 清 quarantine → open 重启。日志落在 <userData>/self-update.log 便于排查。
 * 目录不可写 / 脚本写不上 / 进程拉不起 → 抛错,由上层降级为下载 dmg 手动装。
 */
function installViaSelfReplace(zipPath: string): void {
  // exe = .../Skillkit.app/Contents/MacOS/Skillkit → 向上三级即 .app 包
  const exe = app.getPath('exe');
  const bundle = path.dirname(path.dirname(path.dirname(exe)));
  if (!bundle.endsWith('.app')) {
    throw new Error(`无法定位 app 包路径(${bundle})`);
  }
  const installDir = path.dirname(bundle);
  // 换包 = 对所在目录做 rename,必须可写(正常 dmg 拖装的 app 在 ~/Applications 或 /Applications
  // 且属主是当前用户;只读位置如 /Volumes 挂载盘会在这里抛错降级)
  fs.accessSync(installDir, fs.constants.W_OK);

  const userData = app.getPath('userData');
  const scriptPath = path.join(userData, 'self-update.sh');
  const script = [
    '#!/bin/bash',
    '# Skillkit 自更新替换脚本(detached 运行,不依赖父进程存活)',
    '# 用法: self-update.sh <app_pid> <zip> <dest_bundle> <log>',
    'PID="$1"; ZIP="$2"; DEST="$3"; LOG="$4"',
    'exec >>"$LOG" 2>&1',
    `echo "=== self-update $(date '+%F %T') pid=$PID dest=$DEST ==="`,
    '',
    '# 1) 等老 app 退出(最多 30s;还活着就放弃,避免半死状态换包)',
    'for _ in $(seq 1 150); do',
    '  kill -0 "$PID" 2>/dev/null || break',
    '  sleep 0.2',
    'done',
    'if kill -0 "$PID" 2>/dev/null; then',
    '  echo "abort: app(pid=$PID) 30s 内未退出"',
    '  exit 1',
    'fi',
    '',
    '# 2) 解包(ditto 保留 symlink/权限,unzip 会破坏 Frameworks 里的链接)',
    'TMP="$(mktemp -d "${TMPDIR:-/tmp}/skillkit-update.XXXXXX")"',
    'ditto -x -k "$ZIP" "$TMP" || { echo "abort: ditto 解包失败"; rm -rf "$TMP"; exit 1; }',
    'NEW="$(ls -d "$TMP"/*.app 2>/dev/null | head -n 1)"',
    '[ -n "$NEW" ] || { echo "abort: zip 内未找到 .app"; rm -rf "$TMP"; exit 1; }',
    '',
    '# 3) 原子换包:旧包挪走 → 新包就位;新包就位失败则回滚旧包',
    'OLD="$DEST.old.$$"',
    'mv "$DEST" "$OLD" || { echo "abort: 无法挪走旧包(目录权限?)"; rm -rf "$TMP"; exit 1; }',
    'if ! mv "$NEW" "$DEST"; then',
    '  echo "rollback: 新包就位失败,恢复旧包"',
    '  mv "$OLD" "$DEST"',
    '  rm -rf "$TMP"',
    '  exit 1',
    'fi',
    '',
    '# 4) 清 quarantine、清理现场、重启新版本',
    'xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true',
    'rm -rf "$OLD" "$TMP"',
    'open "$DEST" && echo "done: 已重启 $DEST"',
  ].join('\n');
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  const child = spawn('/bin/bash', [scriptPath, String(process.pid), zipPath, bundle, path.join(userData, 'self-update.log')], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log(`[updater] 自替换脚本已拉起: pid=${child.pid} zip=${zipPath} dest=${bundle}`);
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
let isDownloading = false;
export async function applyUpdate(): Promise<string> {
  if (!lastInfo) throw new Error('没有可用的更新信息,请先检查更新');
  // 并发守卫:TopBar 与设置页是两个入口,避免两路下载抢写同一 dest 损坏安装包。
  if (isDownloading) throw new Error('正在下载更新,请稍候');
  isDownloading = true;
  try {
    return await performAutoUpdate();
  } finally {
    isDownloading = false;
  }
}

/** 返回最近一次检查的缓存结果(供渲染进程挂载时查询,避开启动期检查的竞态)。 */
export function getUpdateStatus(): { available: boolean; info: UpdateAvailableInfo | null } {
  return { available: !!lastInfo, info: lastInfo };
}

// ===== 安装包下载(空闲超时 / 3 次重试 / 进度广播) =====
// 旧实现是裸 https.get,无超时:GitHub 下载 CDN(objects.githubusercontent.com)在国内
// 常被劫持/挂起,socket 既不 error 也不 end → Promise 永久 pending → Windows 上"一直转圈"。
// 这里给每次尝试加空闲超时(治挂起)、最多重试 3 次(带退避,每次从头覆盖下载),
// 并把速度/百分比/重试状态实时广播给渲染层。

const MAX_DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000; // socket 30s 无任何数据视为卡死(连接阶段也算)
const PROGRESS_THROTTLE_MS = 200; // 进度广播节流,避免 IPC 风暴
const RETRY_BACKOFF_BASE_MS = 1_500; // 重试线性退避基数(第 n 次失败后等 n*1.5s)

/** 把下载进度推给所有窗口(镜像 skill-update.ts 的全窗口广播模式)。 */
function broadcastProgress(p: DownloadProgress): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('update:download-progress', p);
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 把任意错误转成一行中文原因,供 UI 展示与重试提示。 */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/timeout|无响应|超时/i.test(msg)) return '网络无响应,下载超时';
  if (/ECONNRESET|socket hang up|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|ECONNREFUSED/i.test(msg)) {
    return '网络连接中断';
  }
  if (/HTTP \d{3}/.test(msg)) return `服务器返回错误(${msg})`;
  return msg;
}

/** downloadOnce 推给上层的纯进度字段(重试/次数语义由外层补全)。 */
type PureProgress = Pick<DownloadProgress, 'transferred' | 'total' | 'percent' | 'speedBps'>;

/**
 * 单次流式下载(跟随重定向)与进度/速度回调。
 * - 空闲超时:从请求一发出就 arm 30s timer,每收到数据/建连重置;超时则 destroy 请求。
 *   这样既覆盖"连不上"也覆盖"连上后挂起"两种 GitHub CDN 症状。
 * - 每次从头覆盖下载(不做断点续传):超时中断时 writeStream 里未落盘的 buffer 会让续传产生
 *   空洞、损坏安装包;重试正确性 > 省流量,所以宁可重头下。
 */
function downloadOnce(
  url: string,
  dest: string,
  onProgress: (p: PureProgress) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let idleTimer: NodeJS.Timeout | null = null;
    let file: fs.WriteStream | null = null;
    let settled = false;

    const clearIdle = (): void => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };
    const armIdle = (req: ClientRequest): void => {
      clearIdle();
      idleTimer = setTimeout(() => {
        req.destroy(new Error('网络无响应(下载超时)'));
      }, DOWNLOAD_IDLE_TIMEOUT_MS);
    };
    const fail = (e: unknown): void => {
      clearIdle();
      if (settled) return;
      settled = true;
      if (file) {
        try {
          file.destroy();
        } catch {
          /* noop */
        }
      }
      reject(e);
    };

    const get = (u: string, depth = 0): void => {
      if (depth > 6) {
        return fail(new Error('too many redirects'));
      }
      const req = https.get(u, { headers: { 'User-Agent': UA } }, (res) => {
        const code = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(code)) {
          res.resume();
          const loc = res.headers.location;
          if (loc) return get(loc, depth + 1);
          return fail(new Error('redirect without location'));
        }
        if (code !== 200) {
          res.resume();
          return fail(new Error(`HTTP ${code}`));
        }

        // 拿到最终响应才创建文件流(每次从头覆盖)
        file = fs.createWriteStream(dest, { flags: 'w' });
        file.on('error', (e) => fail(e));

        const contentLenRaw = res.headers['content-length'];
        const contentLen = contentLenRaw ? parseInt(contentLenRaw, 10) : NaN;
        const total = Number.isFinite(contentLen) ? contentLen : null;

        let transferred = 0;
        let lastEmit = 0;
        let lastBytes = 0;
        let lastTime = Date.now();
        let speed = 0; // 速率移动平均(EMA)

        armIdle(req);
        res.on('data', (chunk: Buffer) => {
          armIdle(req);
          transferred += chunk.length;
          const now = Date.now();
          const dt = now - lastTime;
          if (dt >= 500) {
            const inst = ((transferred - lastBytes) / dt) * 1000;
            speed = speed ? speed * 0.5 + inst * 0.5 : inst; // 平滑
            lastBytes = transferred;
            lastTime = now;
          }
          if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
            lastEmit = now;
            onProgress({
              transferred,
              total,
              percent: total ? Math.min(100, (transferred / total) * 100) : null,
              speedBps: speed,
            });
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          // 终态补发一次,确保 UI 落在 100%
          clearIdle();
          onProgress({
            transferred,
            total,
            percent: total ? 100 : null,
            speedBps: speed,
          });
          if (settled) return;
          settled = true;
          file!.close(() => resolve());
        });
      });
      armIdle(req); // 立即 arm(覆盖连接阶段);连上/有数据时再重置
      req.on('socket', (socket) => {
        socket.on('connect', () => armIdle(req));
      });
      req.on('error', (e) => fail(e));
    };
    get(url);
  });
}

/** 下载安装包,失败自动重试(最多 maxAttempts 次,线性退避);每次失败广播重试状态给 UI。 */
async function downloadWithRetry(url: string, dest: string, maxAttempts: number): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await downloadOnce(url, dest, (p) => {
        broadcastProgress({ ...p, attempt, maxAttempts, phase: 'downloading' });
      });
      return; // 成功
    } catch (e) {
      lastErr = e;
      console.error(
        `[updater] 下载第 ${attempt}/${maxAttempts} 次失败:`,
        e instanceof Error ? e.message : e,
      );
      if (attempt < maxAttempts) {
        // 退避期间通知 UI 正在重试(带原因,让用户知道为什么卡了一下)
        broadcastProgress({
          attempt: attempt + 1,
          maxAttempts,
          transferred: 0,
          total: null,
          percent: null,
          speedBps: 0,
          phase: 'retrying',
          message: friendlyError(e),
        });
        await sleep(RETRY_BACKOFF_BASE_MS * attempt);
      }
    }
  }
  throw new Error(`下载失败(已重试 ${maxAttempts} 次):${friendlyError(lastErr)}`);
}

/**
 * 下载安装包到 ~/Downloads 并打开:
 * macOS 打开 .dmg(挂载 + Finder,用户拖装覆盖);Windows 打开 .exe(启动 nsis 安装器)。
 * 下载内置空闲超时 + 3 次重试;全失败抛带中文原因的错。
 */
export async function downloadAndOpenInstaller(url: string, filename: string): Promise<string> {
  const dest = path.join(app.getPath('downloads'), filename || 'skillkit-installer');
  await downloadWithRetry(url, dest, MAX_DOWNLOAD_ATTEMPTS);
  const openErr = await shell.openPath(dest);
  if (openErr) {
    throw new Error(`无法自动打开安装包(${openErr}),请手动到下载目录双击:${dest}`);
  }
  return dest;
}
