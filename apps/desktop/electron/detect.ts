import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { TOOLS, ALL_TOOLS, isGlobalAgentsOnlyTool } from './tools.js';
import type { Tool, ToolDetection } from '../shared/types.js';

/**
 * 真身探测：判断某 AI 工具是否「真的」装在本机（应用包或 CLI 可执行文件），
 * 而非仅凭配置目录存在（后者会被卸载残留 / 嵌套工具父目录 / 装技能时顺带建出的目录误报）。
 * macOS 为主：.app 包查 /Applications 等；CLI 查常见目录 + nvm + 用户登录 PATH。
 */

const home = os.homedir();
const isMac = process.platform === 'darwin';

/** macOS 应用搜索根（系统级 + 用户级 + 用户个人）。 */
const MAC_APP_ROOTS = isMac
  ? ['/Applications', path.join(home, 'Applications'), '/System/Applications']
  : [];

/**
 * CLI 常见安装目录（快速直查，不依赖 shell）。
 * GUI 启动的 Electron 进程 PATH 通常很精简（不含 homebrew/nvm/各工具自带 bin），
 * 所以先在这些目录里 fs.existsSync 直查；命中不了再用登录 shell 兜底。
 */
const CLI_DIRS = [
  '/opt/homebrew/bin', // Apple Silicon homebrew
  '/usr/local/bin', // Intel homebrew + npm 全局
  '/usr/bin',
  '/bin',
  path.join(home, '.local/bin'),
  path.join(home, '.npm-global/bin'),
  path.join(home, '.bun/bin'),
  path.join(home, '.deno/bin'),
  path.join(home, '.volta/bin'),
  path.join(home, '.cargo/bin'),
  path.join(home, 'Library/pnpm'), // pnpm 全局
];

const exists = (p?: string): boolean => !!p && fs.existsSync(p);

/** 把 home 前缀缩写为 ~，便于在核对面板里展示。 */
const abbreviateHome = (p: string): string => (p && p.startsWith(home) ? '~' + p.slice(home.length) : p);

/** 在 macOS 应用目录下找 .app 包（含一级子目录，兼容 /Applications/<Publisher>/<Name>.app）。 */
function findAppBundle(names: string[] | undefined): string | null {
  if (!isMac || !names?.length) return null;
  for (const root of MAC_APP_ROOTS) {
    for (const name of names) {
      const p = path.join(root, name);
      if (exists(p)) return p;
    }
  }
  // 一级子目录兜底
  for (const root of MAC_APP_ROOTS) {
    if (!exists(root)) continue;
    let subs: string[] = [];
    try {
      subs = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names) {
      for (const sub of subs) {
        const p = path.join(root, sub, name);
        if (exists(p)) return p;
      }
    }
  }
  return null;
}

/** nvm 安装的 CLI：~/.nvm/versions/node/<ver>/bin/<bin>（遍历所有 node 版本）。 */
function findInNvm(bin: string): string | null {
  const nvmRoot = path.join(home, '.nvm', 'versions', 'node');
  if (!exists(nvmRoot)) return null;
  let versions: string[] = [];
  try {
    versions = fs.readdirSync(nvmRoot);
  } catch {
    return null;
  }
  for (const v of versions) {
    const p = path.join(nvmRoot, v, 'bin', bin);
    if (exists(p)) return p;
  }
  return null;
}

/** 快速路径：候选目录 + nvm 直查（同步、不阻塞）。 */
function findCliBinaryFast(bins: string[]): string | null {
  for (const bin of bins) {
    for (const dir of CLI_DIRS) {
      const p = path.join(dir, bin);
      if (exists(p)) return p;
    }
    const nvmHit = findInNvm(bin);
    if (nvmHit) return nvmHit;
  }
  return null;
}

/**
 * 登录 shell 兜底：一次性用用户真实登录 PATH 解析所有 CLI 二进制。
 * 覆盖 ~/.opencode/bin、~/Library/pnpm、asdf/volta 自定义目录等快速路径查不到的位置。
 * 异步（execFile 不阻塞主进程），结果在整个进程内缓存，invalidateDetection 时一并清除。
 * shell 启动噪声（oh-my-zsh 主题加载等）通过「bin 名必须在已知集合 + 路径真实存在」过滤。
 */
let loginResolveCache: Promise<Map<string, string>> | null = null;

function resolveClisViaLoginShell(): Promise<Map<string, string>> {
  if (loginResolveCache) return loginResolveCache;
  loginResolveCache = new Promise<Map<string, string>>((resolve) => {
    const map = new Map<string, string>();
    if (process.platform === 'win32') return resolve(map);
    const allBins = new Set<string>();
    for (const t of ALL_TOOLS) TOOLS[t].cliBinaries?.forEach((b) => allBins.add(b));
    if (!allBins.size) return resolve(map);
    const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    const list = [...allBins]
      .map((b) => `'${b.replace(/'/g, `'"'"'`)}'`)
      .join(' ');
    const script = `for b in ${list}; do p=$(command -v "$b" 2>/dev/null); [ -n "$p" ] && printf '%s|%s\\n' "$b" "$p"; done`;
    execFile(
      shell,
      ['-lic', script],
      { timeout: 6000, env: { ...process.env }, encoding: 'utf8' },
      (err, stdout) => {
        if (!err && stdout) {
          for (const line of stdout.split('\n')) {
            const i = line.indexOf('|');
            if (i <= 0) continue;
            const bin = line.slice(0, i);
            const p = line.slice(i + 1).trim();
            // 仅认「已知 bin 名 + 路径真实存在」，过滤 shell 启动噪声
            if (allBins.has(bin) && p && exists(p)) map.set(bin, p);
          }
        }
        resolve(map);
      },
    );
  });
  return loginResolveCache;
}

/** 在候选目录 + nvm + 登录 shell 真实 PATH 下找 CLI 可执行文件（异步）。 */
async function findCliBinary(bins: string[] | undefined): Promise<string | null> {
  if (!bins?.length) return null;
  const fast = findCliBinaryFast(bins);
  if (fast) return fast;
  const resolved = await resolveClisViaLoginShell();
  for (const bin of bins) {
    const p = resolved.get(bin);
    if (p && exists(p)) return p;
  }
  return null;
}

/**
 * 探测某工具是否真实安装（异步）：
 * - app 包（.app）或 CLI 可执行文件命中即为已安装。
 * - 目录存在不算（会被残留 / 嵌套 / 装技能建目录误报）。没有命中真身一律视为未安装。
 * - 全局共享型工具（cline/warp/kimi）恒为未安装，不单独探测。
 */
export async function detectTool(tool: Tool): Promise<ToolDetection> {
  if (isGlobalAgentsOnlyTool(tool)) {
    return { tool, installed: false, via: null, detail: '' };
  }
  const cfg = TOOLS[tool];
  const app = findAppBundle(cfg.appBundles);
  if (app) return { tool, installed: true, via: 'app', detail: abbreviateHome(app) };
  const cli = await findCliBinary(cfg.cliBinaries);
  if (cli) return { tool, installed: true, via: 'cli', detail: abbreviateHome(cli) };
  return { tool, installed: false, via: null, detail: '' };
}

let cache: Promise<ToolDetection[]> | null = null;

/** 探测全部工具（结果缓存在进程内，直至 invalidateDetection）。 */
export function detectAllTools(): Promise<ToolDetection[]> {
  if (cache) return cache;
  cache = (async () => {
    const results = await Promise.all(ALL_TOOLS.map(detectTool));
    return results;
  })();
  return cache;
}

/** 安装页工具网格用：真身探测命中的工具（app 或 cli）。 */
export async function localTools(): Promise<Tool[]> {
  const all = await detectAllTools();
  return all.filter((d) => d.installed).map((d) => d.tool);
}
