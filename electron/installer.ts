import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import * as tar from 'tar';
import AdmZip from 'adm-zip';
import { TOOLS } from './tools.js';
import { readSkillMd } from './skill-md.js';
import { upsertInstalled } from './db.js';
import type { InstallResult, Tool } from '../shared/types.js';

interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
  subpath?: string;
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
  const res = await fetch(url, { headers: { 'user-agent': 'Skillzix/0.2' } });
  if (!res.ok || !res.body) {
    throw new Error(`无法下载 ${url}（HTTP ${res.status}）`);
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillzix-'));
  // tar.x 接 stream
  await pipeline(Readable.fromWeb(res.body as any), tar.x({ cwd: tmpDir }));
  // tarball 内只有一个顶层目录 `<repo>-<sha>/`
  const top = fs.readdirSync(tmpDir).find((n) => fs.statSync(path.join(tmpDir, n)).isDirectory());
  if (!top) throw new Error('tarball 解包后未找到顶层目录');
  return path.join(tmpDir, top);
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, e.name);
    const dp = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(sp, dp);
    else if (e.isSymbolicLink()) {
      try {
        const linkTo = fs.readlinkSync(sp);
        fs.symlinkSync(linkTo, dp);
      } catch {
        /* skip broken symlink */
      }
    } else if (e.isFile()) {
      fs.copyFileSync(sp, dp);
    }
  }
}

function rmDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 从已经准备好的"skill 源目录"安装到一个 tool 的 installRoot/<name>/ */
function installSourceToTool(srcDir: string, tool: Tool, sourceTag: string): InstallResult {
  const md = readSkillMd(srcDir);
  if (!md) {
    return { tool, ok: false, error: 'SKILL.md 缺失或不可解析' };
  }
  const name = (md.name?.trim() || path.basename(srcDir)).replace(/[^A-Za-z0-9_.-]/g, '-');
  const cfg = TOOLS[tool];
  fs.mkdirSync(cfg.installRoot, { recursive: true });
  const dst = path.join(cfg.installRoot, name);

  // 已存在 → 备份再覆盖
  let backup: string | null = null;
  if (fs.existsSync(dst)) {
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

export async function installFromMarket(
  slug: string,
  targets: Tool[],
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
    return targets.map((t) => installSourceToTool(skillDir, t, `market:${slug}`));
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
        return targets.map((t) => installSourceToTool(child, t, `github:${url}`));
      }
      return targets.map((t) => ({
        tool: t,
        ok: false,
        error: '该路径未发现 SKILL.md（或子目录中也没有单一 SKILL.md）',
      }));
    }
    return targets.map((t) => installSourceToTool(skillDir, t, `github:${url}`));
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

export async function installFromZip(
  zipPath: string,
  targets: Tool[],
): Promise<InstallResult[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillzix-zip-'));
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
    return targets.map((t) =>
      installSourceToTool(skillDir, t, `zip:${path.basename(zipPath)}`),
    );
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

/** 把已安装的 skill 复制到其他工具：源是某个 tool 的 roots/<name>/，目标是其他 tool 的 installRoot/<name>/ */
export function copyInstalledToTools(
  sourceTool: Tool,
  name: string,
  targets: Tool[],
): InstallResult[] {
  const cfg = TOOLS[sourceTool];
  let srcDir: string | null = null;
  for (const root of cfg.roots) {
    const candidate = path.join(root, name);
    if (fs.existsSync(candidate) && readSkillMd(candidate)) {
      srcDir = candidate;
      break;
    }
  }
  if (!srcDir) {
    return targets.map((t) => ({ tool: t, ok: false, error: `未找到源 skill：${name}` }));
  }
  return targets
    .filter((t) => t !== sourceTool)
    .map((t) => installSourceToTool(srcDir!, t, `copy:${sourceTool}/${name}`));
}

/** 卸载：删除目录 */
export function uninstall(tool: Tool, name: string): void {
  const cfg = TOOLS[tool];
  // 在所有 root 下查找该 name 目录（不会动 builtinRoot）
  for (const root of cfg.roots) {
    if (cfg.builtinRoot && root === cfg.builtinRoot) continue;
    const dir = path.join(root, name);
    if (fs.existsSync(dir)) {
      rmDir(dir);
    }
  }
}
