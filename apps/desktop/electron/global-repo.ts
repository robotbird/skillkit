import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TOOLS, ALL_TOOLS } from './tools.js';
import { readSkillMd } from './skill-md.js';
import { copyDir, rmDir, dirSize, safeExists, isWindowsSymlinkError } from './fs-util.js';
import type { Tool, InstallResult, GlobalRepoSkill, GlobalRepoRemoveResult } from '../shared/types.js';

/**
 * 全局仓库（~/.agents/skills）：与 `npx skills`（Vercel Labs skills CLI）互通的共享 skill 目录。
 * 全局安装 = 先写一份规范副本到 ~/.agents/skills/<name>，再把所选工具目录按 软链/拷贝 接入它。
 * 软链（推荐）：单一数据源，改一处全更新，省空间；拷贝：各工具独立副本。
 * 文件系统即真相——规范副本不写 installed_skills 表（该表 tool 列 NOT NULL，且 scanAll 每次清表重写），
 * 全局仓库走独立的 scanGlobalRepo() 扫描。
 */

/** 全局仓库根目录（跨平台经 os.homedir()，与 tools.ts 同约定）。 */
export function globalRepoRoot(): string {
  return path.join(os.homedir(), '.agents', 'skills');
}

interface CanonicalWrite {
  ok: boolean;
  name?: string;
  path?: string;
  error?: string;
}

/** 把 skill 源目录写入规范副本 ~/.agents/skills/<name>（备份 + 回滚，镜像 installSourceToTool 语义）。 */
export function writeToCanonical(srcDir: string, _sourceTag: string): CanonicalWrite {
  const md = readSkillMd(srcDir);
  if (!md) return { ok: false, error: 'SKILL.md 缺失或不可解析' };
  const name = (md.name?.trim() || path.basename(srcDir)).replace(/[^A-Za-z0-9_.-]/g, '-');
  const root = globalRepoRoot();
  fs.mkdirSync(root, { recursive: true });
  const dst = path.join(root, name);

  let backup: string | null = null;
  if (safeExists(dst)) {
    backup = `${dst}.bak-${Date.now()}`;
    fs.renameSync(dst, backup);
  }
  try {
    copyDir(srcDir, dst); // 不写 DB：全局仓库 scan-only
    if (backup) rmDir(backup);
    return { ok: true, name, path: dst };
  } catch (err: any) {
    rmDir(dst);
    if (backup) {
      try {
        fs.renameSync(backup, dst);
      } catch {
        /* ignore */
      }
    }
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * 把规范副本以 软链/拷贝 接入某工具目录。
 * 软链用绝对路径目标（可移植、与 npx skills 一致）；Windows 软链不可用时退回拷贝并附 warn。
 */
export function linkOrCopyFromCanonical(
  canonPath: string,
  tool: Tool,
  method: 'symlink' | 'copy',
  name: string,
): InstallResult {
  const cfg = TOOLS[tool];
  fs.mkdirSync(cfg.installRoot, { recursive: true });
  const dst = path.join(cfg.installRoot, name);

  let backup: string | null = null;
  if (safeExists(dst)) {
    backup = `${dst}.bak-${Date.now()}`;
    fs.renameSync(dst, backup);
  }
  try {
    if (method === 'symlink') {
      try {
        fs.symlinkSync(canonPath, dst, 'dir'); // 绝对路径目标
      } catch (e: any) {
        if (isWindowsSymlinkError(e)) {
          copyDir(canonPath, dst);
          if (backup) rmDir(backup);
          return { tool, ok: true, path: dst, warn: 'Windows 软链不可用，已退回拷贝' };
        }
        throw e;
      }
    } else {
      copyDir(canonPath, dst);
    }
    if (backup) rmDir(backup);
    return { tool, ok: true, path: dst };
  } catch (err: any) {
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

/** 扫描全局仓库下所有 skill（跟随软链确认解析到目录；悬空软链跳过）。 */
export function scanGlobalRepo(): GlobalRepoSkill[] {
  const root = globalRepoRoot();
  const out: GlobalRepoSkill[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return []; // 目录不存在 → 空
  }
  for (const e of entries) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    if (e.name.startsWith('.')) continue; // 跳 .DS_Store / .skill-lock.json / .bak-* 等
    const p = path.join(root, e.name);
    let st: fs.Stats;
    try {
      st = fs.statSync(p); // 跟随软链；悬空软链抛错 → 跳过
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const md = readSkillMd(p);
    if (!md) continue;
    out.push({
      name: md.name?.trim() || e.name,
      description: md.description?.trim() || null,
      path: p,
      sizeBytes: dirSize(p),
      mtime: st.mtimeMs,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * 从全局仓库移除：删规范副本，遍历各工具**仅清理指向 globalRepoRoot 的软链**。
 * 独立拷贝（real dir）无法区分"全局拷贝"与"按工具安装"，留着不动并在结果列出，避免误删用户数据。
 */
export function removeFromGlobalRepo(name: string): GlobalRepoRemoveResult {
  const root = globalRepoRoot();
  const canon = path.join(root, name);
  if (safeExists(canon)) rmDir(canon);

  const removedLinks: Tool[] = [];
  const leftCopies: Tool[] = [];
  for (const t of ALL_TOOLS) {
    const cfg = TOOLS[t];
    const dst = path.join(cfg.installRoot, name);
    const lst = fs.lstatSync(dst, { throwIfNoEntry: false });
    if (!lst) continue;
    if (lst.isSymbolicLink()) {
      let tgt = '';
      try {
        tgt = fs.readlinkSync(dst);
      } catch {
        /* ignore */
      }
      const resolved = path.isAbsolute(tgt) ? tgt : path.resolve(path.dirname(dst), tgt);
      if (resolved === canon || resolved.startsWith(root + path.sep)) {
        fs.rmSync(dst, { force: true });
        removedLinks.push(t);
      }
    } else if (lst.isDirectory()) {
      leftCopies.push(t); // 独立副本，来源不可判定，留给用户处理
    }
  }
  return { removedLinks, leftCopies };
}

/** 把全局仓库中已有 skill 以 软链/拷贝 接入所选工具（"安装到工具…"操作）。 */
export function installGlobalToTools(
  name: string,
  targets: Tool[],
  method: 'symlink' | 'copy',
): InstallResult[] {
  const canon = path.join(globalRepoRoot(), name);
  if (!safeExists(canon) || !readSkillMd(canon)) {
    return targets.map((t) => ({ tool: t, ok: false, error: `全局仓库未找到 ${name}` }));
  }
  return targets.map((t) => linkOrCopyFromCanonical(canon, t, method, name));
}
