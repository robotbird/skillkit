import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import * as tar from 'tar';
import AdmZip from 'adm-zip';
import { TOOLS } from './tools.js';
import { readSkillMd, type SkillMd } from './skill-md.js';
import { upsertInstalled } from './db.js';
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

/** 把 tarball 中 owner/repo[#sub] 这一段解包到 tmpDir，返回它的根目录 */
async function fetchAndExtractTar(ref: RepoRef): Promise<string> {
  const branch = ref.branch ?? 'HEAD';
  const url = `https://codeload.github.com/${ref.owner}/${ref.repo}/tar.gz/${branch}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Skillkit/0.2' } });
  if (!res.ok || !res.body) {
    throw new Error(`无法下载 ${url}（HTTP ${res.status}）`);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillkit-'));
  // tar.x 接 stream(tar 的 Unpack 与 @types/node 的 WritableStream 签名有细微出入,这里强转)
  await pipeline(Readable.fromWeb(res.body as any), tar.x({ cwd: tmpDir }) as unknown as NodeJS.WritableStream);
  // tarball 内只有一个顶层目录 `<repo>-<sha>/`
  const top = fs.readdirSync(tmpDir).find((n) => fs.statSync(path.join(tmpDir, n)).isDirectory());
  if (!top) throw new Error('tarball 解包后未找到顶层目录');
  return path.join(tmpDir, top);
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
    return targets.map((t) => linkOrCopyFromCanonical(canon.path!, t, method, canon.name!));
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
        return dispatchInstall(child, targets, `github:${url}`, opts);
      }
      return targets.map((t) => ({
        tool: t,
        ok: false,
        error: '该路径未发现 SKILL.md（或子目录中也没有单一 SKILL.md）',
      }));
    }
    return dispatchInstall(skillDir, targets, `github:${url}`, opts);
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

/** 列举仓库内的 skill 候选。下载结果缓存在主进程内存，installGithubSkillsAt 复用。 */
export async function listGithubSkills(url: string): Promise<GithubSkillsResult> {
  const ref = parseGithubRef(url);
  if (!ref) throw new Error('GitHub 地址解析失败');
  ensureSweeper();
  const extractedRoot = await cachedExtract(ref);
  const { candidates, isPlugin, pluginHints } = collectRepoSkills(
    extractedRoot,
    ref.subpath ?? '',
  );
  const skills: RepoSkillCandidate[] = candidates.map((c) => ({
    name: c.skill.name?.trim() || path.basename(c.dir),
    description: c.skill.description ?? null,
    subpath: c.subpath,
  }));
  const kind = skills.length === 1 && skills[0].subpath === '' ? 'single' : 'multi';
  return {
    kind,
    skills,
    isPlugin,
    pluginHints,
    repo: `${ref.owner}/${ref.repo}`,
  };
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
  const extractedRoot = await cachedExtract(ref);
  const sourceTagBase = `github:${ref.owner}/${ref.repo}`;

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
    const sourceTag = subpath ? `${sourceTagBase}#${subpath}` : sourceTagBase;
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
  return targets
    .filter((t) => t !== sourceTool)
    .map((t) => installSourceToTool(srcDir, t, `copy:${sourceTool}/${name}`, destName));
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
