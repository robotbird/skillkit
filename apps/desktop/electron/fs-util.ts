import fs from 'node:fs';
import path from 'node:path';

/**
 * 公共文件系统工具。从 installer.ts(copyDir/rmDir) 与 scan.ts(dirSize) 抽取至此，
 * 供 installer / global-repo / scan 共用，避免相互循环依赖。
 */

/** 递归拷贝目录；保留内部软链（按原样重建），其余文件逐个 copyFile。 */
export function copyDir(src: string, dst: string): void {
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

/** 强制递归删除（文件/目录/软链皆可）。 */
export function rmDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 目录占用字节数（跳过 .git / node_modules）。 */
export function dirSize(dir: string): number {
  let total = 0;
  try {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        const full = path.join(cur, e.name);
        try {
          if (e.isDirectory()) stack.push(full);
          else if (e.isFile()) total += fs.statSync(full).size;
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return total;
}

/**
 * 判断路径是否存在（**不跟随软链**）。
 * fs.existsSync 会跟随软链 → 悬空软链返回 false，后续 symlinkSync 会抛 EEXIST。
 * 凡是目标可能是软链的判断，必须用本函数（基于 lstat，任何非 null 结果都算存在）。
 */
export function safeExists(p: string): boolean {
  return fs.lstatSync(p, { throwIfNoEntry: false }) != null;
}

/** 仅在 Windows 下判定为软链不可用错误（无开发者模式/管理员权限时常见）。POSIX 下始终返回 false。 */
export function isWindowsSymlinkError(e: unknown): boolean {
  if (process.platform !== 'win32') return false;
  const code = (e as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EPERM' || code === 'EEXIST' || code === 'ENOSYS';
}
