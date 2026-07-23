import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import * as tar from 'tar';
import AdmZip from 'adm-zip';
import { TOOLS } from './tools.js';
import { readSkillMd, parseFrontmatter, type SkillMd } from './skill-md.js';
import { upsertInstalled, listInstalled } from './db.js';
import { copyDir, rmDir, safeExists } from './fs-util.js';
import { writeToCanonical, linkOrCopyFromCanonical } from './global-repo.js';
import type {
  InstallResult,
  InstallOpts,
  Tool,
  RepoSkillCandidate,
  GithubSkillsResult,
  RepoBatchResult,
} from '../shared/types.js';

interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
}

// ===== 多 skill 仓库扫描常量 =====
const PLUGIN_MARKERS: Record<string, string> = {
  '.claude-plugin': 'Claude Code',
  '.codex-plugin': 'Codex',
  '.cursor-plugin': 'Cursor',
  '.kimi-plugin': 'Kimi',
  '.opencode': 'OpenCode',
};
const SCAN_SKIP = new Set([
  '.git', 'node_modules', 'docs', 'tests', 'test', '__tests__',
  '.github', 'evals', 'dist', 'build', '.next', 'vendor', 'examples', '.cache',
]);
const MAX_DEPTH = 3;
const MAX_CANDIDATES = 50;
const MAX_FILES = 300; // 在线逐文件安装时 skill 目录文件数上限；超过则回退整包 tarball

// ===== tarball 内存缓存（list 与 install 共用一份解包结果）=====
interface CachedTar {
  extractedRoot: string;
  ref: RepoRef;
  at: number; // 最近访问时间戳
}
const tarCache = new Map<string, CachedTar>(); // 插入序即 LRU 序（Map 保持插入顺序）
const TAR_TTL = 10 * 60 * 1000; // 10 分钟
const TAR_CACHE_MAX = 4;

/** 把 ref 规范化为 cache key：list 与 install 传入的 url 形态可能不同，规范化后保证命中。 */
function tarCacheKey(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}@${ref.branch ?? 'HEAD'}#${ref.subpath ?? ''}`;
}

/** 取（或新建）缓存的 extractedRoot；miss 时下载并写入，超上限淘汰最旧。 */
async function cachedExtract(ref: RepoRef): Promise<string> {
  const key = tarCacheKey(ref);
  const hit = tarCache.get(key);
  if (hit) {
    hit.at = Date.now();
    // 访问即 LRU：删后重插到末尾
    tarCache.delete(key);
    tarCache.set(key, hit);
    return hit.extractedRoot;
  }
  const extractedRoot = await fetchAndExtractTar(ref);
  tarCache.set(key, { extractedRoot, ref, at: Date.now() });
  // 超上限淘汰最旧（Map 第一个 = 最早插入且最久未访问）
  while (tarCache.size > TAR_CACHE_MAX) {
    const oldest = tarCache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = tarCache.get(oldest);
    tarCache.delete(oldest);
    if (evicted) {
      try {
        rmDir(path.dirname(evicted.extractedRoot));
      } catch {
        /* ignore */
      }
    }
  }
  return extractedRoot;
}

/** 清理过期缓存项；由 setInterval 定期调用。 */
function sweepTarCache(): void {
  const now = Date.now();
  for (const [key, c] of tarCache) {
    if (now - c.at > TAR_TTL) {
      tarCache.delete(key);
      try {
        rmDir(path.dirname(c.extractedRoot));
      } catch {
        /* ignore */
      }
    }
  }
}

/** 退出时全清缓存（main.ts 的 will-quit 调用）。 */
export function disposeGithubCache(): void {
  for (const [, c] of tarCache) {
    try {
      rmDir(path.dirname(c.extractedRoot));
    } catch {
      /* ignore */
    }
  }
  tarCache.clear();
}

/** 启动期一次性清理 os.tmpdir() 下残留的 skillkit-* 目录（防上次崩溃残留）。 */
export function cleanStaleTmpDirs(): void {
  const tmp = os.tmpdir();
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(tmp);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith('skillkit-')) continue;
    try {
      rmDir(path.join(tmp, name));
    } catch {
      /* ignore */
    }
  }
}

// 启动定期清扫（60s 一次）；模块加载即注册，仅主进程引用一次
let sweeperStarted = false;
function ensureSweeper(): void {
  if (sweeperStarted) return;
  sweeperStarted = true;
  setInterval(sweepTarCache, 60_000).unref?.();
}

/** 解析 GitHub URL / shorthand。
 *  支持 `https://github.com/owner/repo`、`owner/repo`、
 *  `https://github.com/owner/repo/tree/<branch>/<subpath>`、
 *  `git@github.com:owner/repo.git`。
 */
export function parseGithubRef(input: string): RepoRef | null {
  const s = input.trim();
  if (!s) return null;

  // owner/repo 简写
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s)) {
    const [owner, repo] = s.split('/');
    return { owner, repo: repo.replace(/\.git$/, '') };
  }

  // git@github.com:owner/repo(.git)?
  const sshMatch = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  try {
    const u = new URL(s);
    if (!u.hostname.endsWith('github.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repoRaw, kind, branch, ...rest] = parts;
    const repo = repoRaw.replace(/\.git$/, '');
    if (kind === 'tree' && branch) {
      return { owner, repo, branch, subpath: rest.length ? rest.join('/') : undefined };
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

/** 把 RepoRef 规范化为可分享的 GitHub web URL，用作 source 标签与链接型分享地址。
 *  无 subpath -> 仓库根；有 subpath -> /tree/<branch|HEAD>/<subpath>。 */
function githubCanonicalUrl(ref: RepoRef): string {
  const base = `https://github.com/${ref.owner}/${ref.repo}`;
  if (ref.subpath) {
    const branch = ref.branch ?? 'HEAD';
    return `${base}/tree/${branch}/${ref.subpath}`;
  }
  return base;
}

/** 瞬时网络错误(socket 被对端中途关闭 / 连接重置 / 超时 等):值得自动重试 */
function isTransientNetError(e: unknown): boolean {
  const any = e as any;
  const code: unknown = any?.cause?.code ?? any?.code;
  if (typeof code === 'string' && code.startsWith('UND_ERR_')) return true; // UND_ERR_SOCKET 等
  const msg = String(any?.message ?? '');
  return /terminated|other side closed|socket hang up|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(msg);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 把 tarball 中 owner/repo[#sub] 这一段解包到 tmpDir，返回它的根目录。
 * 经 Clash 等代理下大 tarball 时,socket 常被对端中途关闭(UND_ERR_SOCKET / "other side closed")——
 * 这类瞬时错误自动重试若干次;每次失败清理半成品 tmpDir,避免遗留垃圾。
 */
async function fetchAndExtractTar(ref: RepoRef): Promise<string> {
  const branch = ref.branch ?? 'HEAD';
  const url = `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/${branch}`;
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-'));
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Skillkit/0.2' } });
      if (!res.ok || !res.body) {
        throw new Error(`无法下载 ${url}（HTTP ${res.status}）`);
      }
      // tar.x 接 stream(tar 的 Unpack 与 @types/node 的 WritableStream 签名有细微出入,这里强转)
      await pipeline(Readable.fromWeb(res.body as any), tar.x({ cwd: tmpDir }) as unknown as NodeJS.WritableStream);
      // tarball 内只有一个顶层目录 `<repo>-<sha>/`
      const top = fs.readdirSync(tmpDir).find((n) => fs.statSync(path.join(tmpDir, n)).isDirectory());
      if (!top) throw new Error('tarball 解包后未找到顶层目录');
      return path.join(tmpDir, top);
    } catch (e) {
      // 清理本次半成品 tmpDir,避免遗留垃圾(无论何种失败)
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* 忽略清理失败 */ }
      lastErr = e;
      // 仅瞬时网络错误重试;HTTP 状态码/解析错误等确定性失败立即抛出
      if (!isTransientNetError(e) || attempt === MAX_ATTEMPTS) break;
      await sleep(400 * attempt); // 退避:400ms、800ms
    }
  }
  if (isTransientNetError(lastErr)) {
    throw new Error(`下载 ${url} 时网络中断，已重试 ${MAX_ATTEMPTS} 次仍失败，请检查代理/网络后重试`);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 从已经准备好的"skill 源目录"安装到一个 tool 的 installRoot/<name>/ */
function installSourceToTool(
  srcDir: string,
  tool: Tool,
  sourceTag: string,
  destName?: string,
): InstallResult {
  const md = readSkillMd(srcDir);
  if (!md) {
    return { tool, ok: false, error: 'SKILL.md 缺失或不可解析' };
  }
  // 目标目录名：调用方给了就用它（copy 时传源目录名，保证跨工具同名），
  // 否则取 frontmatter name 再规范化（market/github/zip 来源的 name 通常已是合法标识）
  const rawName = destName ?? (md.name?.trim() || path.basename(srcDir));
  const name = rawName.replace(/[^A-Za-z0-9_.-]/g, '-');
  const cfg = TOOLS[tool];
  fs.mkdirSync(cfg.installRoot, { recursive: true });
  const dst = path.join(cfg.installRoot, name);

  // 已存在 → 备份再覆盖（dst 可能是软链，用 safeExists 不跟随，避免悬空软链漏判）
  let backup: string | null = null;
  if (safeExists(dst)) {
    backup = `${dst}.bak-${Date.now()}`;
    fs.renameSync(dst, backup);
  }
  try {
    copyDir(srcDir, dst);
    upsertInstalled({
      tool,
      name,
      description: md.description ?? null,
      path: dst,
      isBuiltin: false,
      sizeBytes: null,
      mtime: Date.now(),
      source: sourceTag,
      installedAt: Date.now(),
    });
    if (backup) rmDir(backup);
    return { tool, ok: true, path: dst };
  } catch (err: any) {
    // 回滚
    rmDir(dst);
    if (backup) {
      try {
        fs.renameSync(backup, dst);
      } catch {
        /* ignore */
      }
    }
    return { tool, ok: false, error: err?.message || String(err) };
  }
}

/**
 * 安装分发：根据 opts.scope 决定走「按工具拷贝」（installSourceToTool，当前行为）
 * 还是「全局规范副本 + 按方式接入各工具」（writeToCanonical 一次 + linkOrCopyFromCanonical）。
 */
function dispatchInstall(
  srcDir: string,
  targets: Tool[],
  sourceTag: string,
  opts?: InstallOpts,
): InstallResult[] {
  if (opts?.scope === 'global') {
    const method = opts.method ?? 'symlink';
    const canon = writeToCanonical(srcDir, sourceTag);
    if (!canon.ok || !canon.path || !canon.name) {
      return targets.map((t) => ({ tool: t, ok: false, error: canon.error }));
    }
    // 全局安装也要写 installed_skills.source，否则扫描只写 null、GitHub 来源丢失。
    // name 取规范副本的 frontmatter 名（与 scanTool 同源），保证 (tool,name) 键一致，
    // 后续 scanAll 靠 upsertInstalled 的 COALESCE 保留 source。
    const canonMd = readSkillMd(canon.path);
    const name = canonMd?.name?.trim() || canon.name;
    return targets.map((t) => {
      const r = linkOrCopyFromCanonical(canon.path!, t, method, canon.name!);
      if (r.ok && r.path) {
        upsertInstalled({
          tool: t,
          name,
          description: canonMd?.description ?? null,
          path: r.path,
          isBuiltin: false,
          sizeBytes: null,
          mtime: Date.now(),
          source: sourceTag,
          installedAt: Date.now(),
        });
      }
      return r;
    });
  }
  return targets.map((t) => installSourceToTool(srcDir, t, sourceTag));
}

export async function installFromMarket(
  slug: string,
  targets: Tool[],
  opts?: InstallOpts,
): Promise<InstallResult[]> {
  const [owner, repo, name] = slug.split('/');
  if (!owner || !repo || !name) {
    return targets.map((t) => ({ tool: t, ok: false, error: 'slug 不合法' }));
  }
  let extractedRoot: string | null = null;
  try {
    extractedRoot = await fetchAndExtractTar({ owner, repo });
    const skillDir = path.join(extractedRoot, name);
    if (!fs.existsSync(skillDir)) {
      return targets.map((t) => ({ tool: t, ok: false, error: `仓库中找不到 ${name}/` }));
    }
    return dispatchInstall(skillDir, targets, `market:${slug}`, opts);
  } catch (err: any) {
    return targets.map((t) => ({ tool: t, ok: false, error: err?.message || String(err) }));
  } finally {
    if (extractedRoot) {
      const tmpRoot = path.dirname(extractedRoot);
      try {
        rmDir(tmpRoot);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function installFromGithub(
  url: string,
  targets: Tool[],
  opts?: InstallOpts,
): Promise<InstallResult[]> {
  const ref = parseGithubRef(url);
  if (!ref) {
    return targets.map((t) => ({ tool: t, ok: false, error: 'GitHub 地址解析失败' }));
  }
  // 优先在线逐文件安装（只拉选中 skill 子树的文件，不下整包 tarball）；失败回退整包
  try {
    return await installGithubViaApi(ref, targets, opts);
  } catch {
    /* 回退整包 tarball */
  }
  let extractedRoot: string | null = null;
  try {
    extractedRoot = await fetchAndExtractTar(ref);
    const skillDir = ref.subpath ? path.join(extractedRoot, ref.subpath) : extractedRoot;
    if (!fs.existsSync(skillDir)) {
      return targets.map((t) => ({ tool: t, ok: false, error: '指定路径不存在' }));
    }
    if (!readSkillMd(skillDir)) {
      // 试着从仓库根扫一层下面是否含单一 SKILL.md 子目录
      const child = findSingleSkillChild(skillDir);
      if (child) {
        return dispatchInstall(child, targets, `github:${githubCanonicalUrl(ref)}`, opts);
      }
      return targets.map((t) => ({
        tool: t,
        ok: false,
        error: '该路径未发现 SKILL.md（或子目录中也没有单一 SKILL.md）',
      }));
    }
    return dispatchInstall(skillDir, targets, `github:${githubCanonicalUrl(ref)}`, opts);
  } catch (err: any) {
    return targets.map((t) => ({ tool: t, ok: false, error: err?.message || String(err) }));
  } finally {
    if (extractedRoot) {
      const tmpRoot = path.dirname(extractedRoot);
      try {
        rmDir(tmpRoot);
      } catch {
        /* ignore */
      }
    }
  }
}

function findSingleSkillChild(dir: string): string | null {
  let found: string | null = null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const sub = path.join(dir, e.name);
    if (readSkillMd(sub)) {
      if (found) return null; // 多个候选 → 拒绝自动猜
      found = sub;
    }
  }
  return found;
}

interface RawCandidate {
  dir: string; // 绝对路径（在 extractedRoot 内）
  subpath: string; // 相对 extractedRoot
  skill: SkillMd;
}

/** 广度优先搜集 startDir 下所有「自身目录含有效 SKILL.md/AGENTS.md」的目录。
 *  单 skill 短路：startDir 自身有 frontmatter → 返回该唯一候选（零回归，走原直装路径）。
 *  另检测 plugin 框架目录（在 extractedRoot 根）。 */
function collectRepoSkills(
  extractedRoot: string,
  startSubpath: string,
): { candidates: RawCandidate[]; isPlugin: boolean; pluginHints: string[] } {
  const startDir = startSubpath ? path.join(extractedRoot, startSubpath) : extractedRoot;
  if (!fs.existsSync(startDir)) return { candidates: [], isPlugin: false, pluginHints: [] };

  // 单 skill 短路
  const direct = readSkillMd(startDir);
  if (direct) {
    return {
      candidates: [{ dir: startDir, subpath: startSubpath, skill: direct }],
      isPlugin: false,
      pluginHints: [],
    };
  }

  const candidates: RawCandidate[] = [];
  const seen = new Set<string>();
  // BFS：元素 [目录绝对路径, 相对 extractedRoot 的 subpath, 深度]
  const queue: Array<[string, string, number]> = [[startDir, startSubpath, 0]];

  while (queue.length > 0 && candidates.length < MAX_CANDIDATES) {
    const [dir, subpath, depth] = queue.shift()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      // 跳过 plugin marker 目录（不含 skill，避免误判）与噪声目录
      if (PLUGIN_MARKERS[e.name] || SCAN_SKIP.has(e.name)) continue;
      if (e.name.startsWith('.') && !PLUGIN_MARKERS[e.name]) continue; // 跳其它隐藏目录
      const childAbs = path.join(dir, e.name);
      const childSub = subpath ? `${subpath}/${e.name}` : e.name;
      const md = readSkillMd(childAbs);
      if (md) {
        if (!seen.has(childSub)) {
          seen.add(childSub);
          candidates.push({ dir: childAbs, subpath: childSub, skill: md });
          if (candidates.length >= MAX_CANDIDATES) break;
        }
        // skill 目录不再下钻（不会嵌套 skill）
        continue;
      }
      if (depth + 1 < MAX_DEPTH) {
        queue.push([childAbs, childSub, depth + 1]);
      }
    }
  }

  // plugin 框架识别：只在 extractedRoot 根这一层检查 marker 目录
  const pluginHints: string[] = [];
  try {
    const rootEntries = fs.readdirSync(extractedRoot, { withFileTypes: true });
    for (const e of rootEntries) {
      if (e.isDirectory() && PLUGIN_MARKERS[e.name]) {
        pluginHints.push(PLUGIN_MARKERS[e.name]);
      }
    }
  } catch {
    /* ignore */
  }
  // 仅当同时扫到 skill 候选才标记 isPlugin（否则只是个空 plugin 仓库，由 UI 友好报错）
  const isPlugin = pluginHints.length > 0 && candidates.length > 0;

  return { candidates, isPlugin, pluginHints };
}

// ===== GitHub API 在线扫描（不下整包 tarball）=====
// 一次 git/trees?recursive=1 拿全文件树，再对候选目录逐个 raw 拉 MD。
// 任何失败（限流 / 私有 / 超大树 / 网络）→ 抛错，由 listGithubSkills 回退整包 tarball 扫描。

const GH_API = 'https://api.github.com';
const GH_RAW = 'https://raw.githubusercontent.com';
const GH_TOKEN = process.env.GITHUB_TOKEN?.trim(); // 可选：把匿名 60/小时限流抬到 5000/小时

/** GitHub GET（API 或 raw）：UA + 超时 + 可选 token + 瞬时错误重试（复用 isTransientNetError）。 */
async function ghGet(url: string, json: boolean): Promise<Response> {
  const headers: Record<string, string> = { 'user-agent': 'Skillkit/0.2' };
  if (json) headers.accept = 'application/vnd.github+json';
  if (GH_TOKEN) headers.authorization = `bearer ${GH_TOKEN}`;
  const MAX = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      return await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    } catch (e) {
      lastErr = e;
      if (!isTransientNetError(e) || attempt === MAX) break;
      await sleep(400 * attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function ghApiJson<T>(url: string): Promise<T> {
  const res = await ghGet(url, true);
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function ghRawText(url: string): Promise<string> {
  const res = await ghGet(url, false);
  if (!res.ok) throw new Error(`raw HTTP ${res.status}`);
  return await res.text();
}

async function ghRawBytes(url: string): Promise<Buffer> {
  const res = await ghGet(url, false);
  if (!res.ok) throw new Error(`raw HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 无 branch 时取默认分支（raw URL 需要真实 branch，不接受 HEAD）。 */
async function defaultBranch(owner: string, repo: string): Promise<string> {
  const info = await ghApiJson<{ default_branch?: string }>(`${GH_API}/repos/${owner}/${repo}`);
  return info.default_branch || 'main';
}

interface TreeEntry {
  path: string;
  type: string;
}
interface TreesResponse {
  tree: TreeEntry[];
  truncated?: boolean;
}

/** git/trees/{branch}?recursive=1：返回扁平全树。truncated（>100k 条目）时抛错触发兜底。 */
async function fetchRepoTree(owner: string, repo: string, branch: string): Promise<TreesResponse> {
  const data = await ghApiJson<TreesResponse>(
    `${GH_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
  );
  if (data.truncated) throw new Error('仓库文件树过大(>100k 条目)');
  return data;
}

interface TreeNode {
  name: string;
  isDir: boolean;
}

/** 把扁平 tree 归一为：blobs 集合 + 父目录→子项（根 key 为 ''）。 */
function indexTree(entries: TreeEntry[]): {
  blobs: Set<string>;
  childrenOf: Map<string, TreeNode[]>;
} {
  const blobs = new Set<string>();
  const childrenOf = new Map<string, TreeNode[]>();
  for (const e of entries) {
    const segs = e.path.split('/');
    const name = segs[segs.length - 1];
    const parent = segs.length > 1 ? segs.slice(0, -1).join('/') : '';
    if (e.type === 'blob') blobs.add(e.path);
    let list = childrenOf.get(parent);
    if (!list) {
      list = [];
      childrenOf.set(parent, list);
    }
    list.push({ name, isDir: e.type === 'tree' });
  }
  return { blobs, childrenOf };
}

/** raw URL：逐段编码 path，避免子目录名里的特殊字符。 */
function rawUrl(owner: string, repo: string, branch: string, relPath: string): string {
  const encPath = relPath.split('/').map(encodeURIComponent).join('/');
  return `${GH_RAW}/${owner}/${repo}/${encodeURIComponent(branch)}/${encPath}`;
}

/** 镜像 readSkillMd：SKILL.md 再 AGENTS.md，首个有效 frontmatter 胜出。
 *  先用 blobs 判存在（避免 404 空拉），存在才 raw 拉取 + parseFrontmatter。 */
async function fetchMd(
  dirRel: string,
  blobs: Set<string>,
  owner: string,
  repo: string,
  branch: string,
): Promise<SkillMd | null> {
  for (const file of ['SKILL.md', 'AGENTS.md']) {
    const p = dirRel ? `${dirRel}/${file}` : file;
    if (!blobs.has(p)) continue;
    try {
      const md = parseFrontmatter(await ghRawText(rawUrl(owner, repo, branch, p)));
      if (md) return md;
    } catch {
      // 继续尝试下一个候选 / 忽略
    }
  }
  return null;
}

/** 镜像 collectRepoSkills，但在内存文件树（git/trees）上跑，MD 内容在线 raw 拉。 */
async function collectRepoSkillsFromTree(
  ref: RepoRef,
  branch: string,
  blobs: Set<string>,
  childrenOf: Map<string, TreeNode[]>,
  startSubpath: string,
): Promise<{
  candidates: Array<{ subpath: string; skill: SkillMd }>;
  isPlugin: boolean;
  pluginHints: string[];
}> {
  // 单 skill 短路：startSubpath 自身有有效 MD
  const direct = await fetchMd(startSubpath, blobs, ref.owner, ref.repo, branch);
  if (direct) {
    return { candidates: [{ subpath: startSubpath, skill: direct }], isPlugin: false, pluginHints: [] };
  }

  const candidates: Array<{ subpath: string; skill: SkillMd }> = [];
  const seen = new Set<string>();
  const queue: Array<[string, number]> = [[startSubpath, 0]]; // [dirRel, depth]

  while (queue.length > 0 && candidates.length < MAX_CANDIDATES) {
    const [dir, depth] = queue.shift()!;
    const children = childrenOf.get(dir);
    if (!children) continue;
    for (const c of children) {
      if (!c.isDir) continue;
      if (PLUGIN_MARKERS[c.name] || SCAN_SKIP.has(c.name)) continue;
      if (c.name.startsWith('.')) continue; // 其它隐藏目录
      const childSub = dir ? `${dir}/${c.name}` : c.name;
      if (seen.has(childSub)) continue;
      const md = await fetchMd(childSub, blobs, ref.owner, ref.repo, branch);
      if (md) {
        seen.add(childSub);
        candidates.push({ subpath: childSub, skill: md });
        if (candidates.length >= MAX_CANDIDATES) break;
        continue; // skill 目录不再下钻
      }
      seen.add(childSub);
      if (depth + 1 < MAX_DEPTH) queue.push([childSub, depth + 1]);
    }
  }

  // plugin 框架识别：仅根层目录命中 marker（与 collectRepoSkills 一致）
  const pluginHints: string[] = [];
  for (const c of childrenOf.get('') ?? []) {
    if (c.isDir && PLUGIN_MARKERS[c.name]) pluginHints.push(PLUGIN_MARKERS[c.name]);
  }
  const isPlugin = pluginHints.length > 0 && candidates.length > 0;
  return { candidates, isPlugin, pluginHints };
}

/** 候选 -> RepoSkillCandidate[] + kind（API 路径与 tarball 兜底共用）。 */
function buildResult(
  candidates: Array<{ subpath: string; skill: SkillMd }>,
  isPlugin: boolean,
  pluginHints: string[],
  ref: RepoRef,
): GithubSkillsResult {
  const skills: RepoSkillCandidate[] = candidates.map((c) => ({
    name: c.skill.name?.trim() || (c.subpath ? path.basename(c.subpath) : ref.repo),
    description: c.skill.description ?? null,
    subpath: c.subpath,
  }));
  const kind = skills.length === 1 && skills[0].subpath === '' ? 'single' : 'multi';
  return { kind, skills, isPlugin, pluginHints, repo: `${ref.owner}/${ref.repo}` };
}

/** 在线 API 扫描：git/trees + 逐个 raw MD。失败则抛错，由调用方回退整包 tarball。 */
async function listGithubSkillsViaApi(ref: RepoRef): Promise<GithubSkillsResult> {
  const branch = ref.branch ?? (await defaultBranch(ref.owner, ref.repo));
  const tree = await fetchRepoTree(ref.owner, ref.repo, branch);
  const { blobs, childrenOf } = indexTree(tree.tree);
  const { candidates, isPlugin, pluginHints } = await collectRepoSkillsFromTree(
    ref,
    branch,
    blobs,
    childrenOf,
    ref.subpath ?? '',
  );
  return buildResult(candidates, isPlugin, pluginHints, ref);
}

/** 列举仓库内的 skill 候选。
 *  优先走在线 API（git/trees + 逐个 raw MD，不下载整包）；API 失败（限流/私有/超大树/网络）
 *  回退整包 tarball 扫描，保证不退化。安装同理：installFromGithub / installGithubSkillsAt
 *  也优先在线逐文件，失败回退整包（见下方）。 */
export async function listGithubSkills(url: string): Promise<GithubSkillsResult> {
  const ref = parseGithubRef(url);
  if (!ref) throw new Error('GitHub 地址解析失败');
  ensureSweeper();
  // 优先在线 API 扫描（git/trees + 逐个 raw MD）。API 抛错（限流/私有/超大树/网络）
  // 或扫到 0 候选（某文件 raw 拉取被限流导致漏判）时，都回退整包 tarball 再扫一遍——
  // 整包来自 codeload，不受 raw/API 限流影响，对「skill 在二级目录、单文件 raw 失败」更稳。
  let result: GithubSkillsResult | null = null;
  try {
    result = await listGithubSkillsViaApi(ref);
  } catch {
    /* 落到下方整包兜底 */
  }
  if (!result || result.skills.length === 0) {
    const extractedRoot = await cachedExtract(ref);
    const { candidates, isPlugin, pluginHints } = collectRepoSkills(extractedRoot, ref.subpath ?? '');
    result = buildResult(candidates, isPlugin, pluginHints, ref);
  }
  return result;
}

// ===== GitHub API 在线安装（只拉选中 skill 子树的文件，不下整包 tarball）=====

/** 一次性拿到仓库文件树的所有 blob 路径（按 subpath 过滤后逐文件 raw 拉）。 */
async function resolveTreeBlobs(ref: RepoRef): Promise<{ branch: string; blobs: string[] }> {
  const branch = ref.branch ?? (await defaultBranch(ref.owner, ref.repo));
  const tree = await fetchRepoTree(ref.owner, ref.repo, branch);
  const blobs = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path);
  return { branch, blobs };
}

/** subpath 子树下的 blob 路径（subpath='' 即整个仓库根）。 */
function blobsUnderSubpath(blobs: string[], subpath: string): string[] {
  if (!subpath) return blobs;
  const prefix = `${subpath}/`;
  return blobs.filter((p) => p.startsWith(prefix));
}

/**
 * 在线拉取 subpath 下的所有文件，按原结构写到本地 tmpDir，作为 skill 源目录（供 dispatchInstall）。
 * 不下整包 tarball；文件数 > MAX_FILES 时抛错，由调用方回退整包。失败时自行清理 tmpDir。
 */
async function buildLocalSkillDir(
  ref: RepoRef,
  branch: string,
  subpath: string,
  blobs: string[],
): Promise<{ dir: string; tmpRoot: string }> {
  const files = blobsUnderSubpath(blobs, subpath);
  if (files.length === 0) throw new Error('该路径下无文件');
  if (files.length > MAX_FILES) throw new Error(`skill 目录文件过多(>${MAX_FILES})`);
  const prefix = subpath ? `${subpath}/` : '';
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-gh-'));
  try {
    for (const p of files) {
      const rel = prefix ? p.slice(prefix.length) : p;
      const dest = path.join(tmpRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await ghRawBytes(rawUrl(ref.owner, ref.repo, branch, p)));
    }
    return { dir: tmpRoot, tmpRoot };
  } catch (e) {
    try { rmDir(tmpRoot); } catch { /* ignore */ }
    throw e;
  }
}

/** 在线逐文件安装单个 skill（subpath 来自 ref）。失败抛错 -> installFromGithub 回退整包。 */
async function installGithubViaApi(
  ref: RepoRef,
  targets: Tool[],
  opts?: InstallOpts,
): Promise<InstallResult[]> {
  const { branch, blobs } = await resolveTreeBlobs(ref);
  const { dir, tmpRoot } = await buildLocalSkillDir(ref, branch, ref.subpath ?? '', blobs);
  try {
    const sourceTag = `github:${githubCanonicalUrl(ref)}`;
    if (!readSkillMd(dir)) {
      const child = findSingleSkillChild(dir);
      if (child) return dispatchInstall(child, targets, sourceTag, opts);
      return targets.map((t) => ({
        tool: t,
        ok: false,
        error: '该路径未发现 SKILL.md（或子目录中也没有单一 SKILL.md）',
      }));
    }
    return dispatchInstall(dir, targets, sourceTag, opts);
  } finally {
    try { rmDir(tmpRoot); } catch { /* ignore */ }
  }
}

/** 在线逐文件批量安装多个 subpath。任一 subpath 文件过多/为空则整体回退整包（避免装一半）。 */
async function installGithubSkillsAtViaApi(
  ref: RepoRef,
  subpaths: string[],
  targets: Tool[],
  opts?: InstallOpts,
): Promise<RepoBatchResult[]> {
  const { branch, blobs } = await resolveTreeBlobs(ref);
  // 预检：任一 subpath 超量/为空 -> 整体回退整包（不在循环内部分失败）
  for (const subpath of subpaths) {
    const n = blobsUnderSubpath(blobs, subpath).length;
    if (n === 0 || n > MAX_FILES) throw new Error('skill 目录文件过多或为空，回退整包');
  }
  const results: RepoBatchResult[] = [];
  for (const subpath of subpaths) {
    let tmpRoot: string | null = null;
    try {
      const built = await buildLocalSkillDir(ref, branch, subpath, blobs);
      tmpRoot = built.tmpRoot;
      const md = readSkillMd(built.dir);
      const skillName = md?.name?.trim() || (subpath ? subpath.split('/').pop()! : ref.repo);
      if (!md) {
        results.push({
          subpath,
          skillName,
          results: targets.map((t) => ({ tool: t, ok: false, error: '指定 skill 路径不存在或缺少有效 SKILL.md' })),
        });
        continue;
      }
      const fullSubpath = [ref.subpath, subpath].filter(Boolean).join('/') || undefined;
      const sourceTag = `github:${githubCanonicalUrl({ ...ref, subpath: fullSubpath })}`;
      results.push({ subpath, skillName, results: dispatchInstall(built.dir, targets, sourceTag, opts) });
    } finally {
      if (tmpRoot) { try { rmDir(tmpRoot); } catch { /* ignore */ } }
    }
  }
  return results;
}

/** 批量安装仓库内多个 subpath（=多个 skill）到所选工具。复用缓存的 extractedRoot。 */
export async function installGithubSkillsAt(
  url: string,
  subpaths: string[],
  targets: Tool[],
  opts?: InstallOpts,
): Promise<RepoBatchResult[]> {
  if (!subpaths.length || !targets.length) return [];
  const ref = parseGithubRef(url);
  if (!ref) {
    return subpaths.map((subpath) => ({
      subpath,
      skillName: subpath.split('/').pop() ?? subpath,
      results: targets.map((t) => ({ tool: t, ok: false, error: 'GitHub 地址解析失败' })),
    }));
  }
  ensureSweeper();
  // 优先在线逐文件安装（只拉选中 skill 子树的文件，不下整包 tarball）；失败回退整包缓存
  try {
    return await installGithubSkillsAtViaApi(ref, subpaths, targets, opts);
  } catch {
    /* 回退整包 tarball（走缓存） */
  }
  const extractedRoot = await cachedExtract(ref);

  return subpaths.map((subpath) => {
    const skillDir = subpath ? path.join(extractedRoot, subpath) : extractedRoot;
    const md = readSkillMd(skillDir);
    const skillName = md?.name?.trim() || (subpath ? subpath.split('/').pop()! : ref.repo);
    if (!fs.existsSync(skillDir) || !md) {
      return {
        subpath,
        skillName,
        results: targets.map((t) => ({
          tool: t,
          ok: false,
          error: '指定 skill 路径不存在或缺少有效 SKILL.md',
        })),
      };
    }
    // 规范化为 GitHub web URL（subpath 相对 extractedRoot，需拼接 ref 自身的 subpath）
    const fullSubpath = [ref.subpath, subpath].filter(Boolean).join('/') || undefined;
    const sourceTag = `github:${githubCanonicalUrl({ ...ref, subpath: fullSubpath })}`;
    const results = dispatchInstall(skillDir, targets, sourceTag, opts);
    return { subpath, skillName, results };
  });
}

export async function installFromZip(
  zipPath: string,
  targets: Tool[],
  opts?: InstallOpts,
): Promise<InstallResult[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-zip-'));
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);
    // 寻找最浅一层包含 SKILL.md 的目录
    let skillDir = tmpDir;
    if (!readSkillMd(skillDir)) {
      const child = findSingleSkillChild(tmpDir);
      if (child) skillDir = child;
      else {
        return targets.map((t) => ({
          tool: t,
          ok: false,
          error: 'zip 中未发现 SKILL.md',
        }));
      }
    }
    return dispatchInstall(skillDir, targets, `zip:${path.basename(zipPath)}`, opts);
  } catch (err: any) {
    return targets.map((t) => ({ tool: t, ok: false, error: err?.message || String(err) }));
  } finally {
    try {
      rmDir(tmpDir);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 在某个工具的 roots 下解析 skill 的真实目录。
 * `name` 可能是 SKILL.md frontmatter 里的展示名（与目录名不一致，例如
 * "股票价值投资分析 (valuation-analysis)" 的目录其实是 `valuation-analysis`），
 * 也可能就是目录名本身。先用 `name` 当目录名直查，命中不了再遍历目录按
 * frontmatter name 精确匹配，确保展示名 ≠ 目录名的 skill 也能定位。
 */
function findInstalledSkillDir(tool: Tool, name: string): string | null {
  const cfg = TOOLS[tool];
  for (const root of cfg.roots) {
    if (!fs.existsSync(root)) continue;
    // (1) 把 name 当目录名直查（多数 skill 的 name == 目录名）
    const direct = path.join(root, name);
    if (readSkillMd(direct)) return direct;
    // (2) 回退：按 frontmatter name 匹配（展示名 ≠ 目录名）
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith('.')) continue;
      const d = path.join(root, e.name);
      const md = readSkillMd(d);
      if (md && md.name?.trim() === name) return d;
    }
  }
  return null;
}

/** 把已安装的 skill 复制到其他工具：源是某个 tool 的 roots/<dir>/，目标是其他 tool 的 installRoot/<dir>/ */
export function copyInstalledToTools(
  sourceTool: Tool,
  name: string,
  targets: Tool[],
): InstallResult[] {
  const srcDir = findInstalledSkillDir(sourceTool, name);
  if (!srcDir) {
    return targets.map((t) => ({ tool: t, ok: false, error: `未找到源 skill：${name}` }));
  }
  // 目标目录沿用源目录名（而非展示名），避免把 "股票价值投资分析 (valuation-analysis)"
  // 这类 name 洗成全短横的乱码目录；跨工具身份仍由 frontmatter name 决定，分组不受影响。
  const destName = path.basename(srcDir);
  // 来源沿用：若源 skill 是 GitHub 安装的，复制到其它工具后仍保留 github 来源（仍可走链接型分享）；
  // 否则标记 copy:<源工具>/<name>。
  const srcSource = listInstalled({ tool: sourceTool }).find((s) => s.name === name)?.source ?? null;
  const sourceTag = srcSource?.startsWith('github:') ? srcSource : `copy:${sourceTool}/${name}`;
  return targets
    .filter((t) => t !== sourceTool)
    .map((t) => installSourceToTool(srcDir, t, sourceTag, destName));
}

/** 卸载：删除目录 */
export function uninstall(tool: Tool, name: string): void {
  const cfg = TOOLS[tool];
  // 先用 name 直查（多数 skill name == 目录名），再按 frontmatter name 兜底，
  // 覆盖展示名 ≠ 目录名的情况；不动 builtinRoot。
  const matched = new Set<string>();
  for (const root of cfg.roots) {
    if (cfg.builtinRoot && root === cfg.builtinRoot) continue;
    if (!fs.existsSync(root)) continue;
    const direct = path.join(root, name);
    if (fs.existsSync(direct)) matched.add(direct);
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (!e.isDirectory() && !e.isSymbolicLink()) continue;
        const d = path.join(root, e.name);
        const md = readSkillMd(d);
        if (md && md.name?.trim() === name) matched.add(d);
      }
    } catch {
      /* ignore */
    }
  }
  for (const dir of matched) rmDir(dir);
}
