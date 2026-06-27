import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// monorepo 根是本仓库根(含 pnpm-workspace.yaml)。显式指定 turbopack.root,
// 避免 Next 在父目录误探到其它 lockfile(如 ~/pnpm-lock.yaml)而选错 workspace 根。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const nextConfig: NextConfig = {
  // @skillkit/types 是 monorepo 内的纯 TS workspace 包(无构建产物),
  // 必须显式 transpile,否则 Next.js 不会编译它、运行时拿不到 .js。
  transpilePackages: ['@skillkit/types'],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
