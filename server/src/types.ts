// 分享服务运行时常量与类型(自包含副本,server 不再外部引用 shared/)。
//
// 为什么不直接 import shared/types.ts:shared/types.ts 是桌面端(主进程 + renderer
// 通过 @shared alias)的契约,但 server/ 在 Vercel 上由 @vercel/node 编译,跨目录
// 引用 /api 外的 TS 会在运行时拿不到 .js(见 CLAUDE.md 的 ERR_MODULE_NOT_FOUND 教训)。
// 因此 server/ 自带它需要的运行时子集。若 shared/types.ts 里的
// SHARE_TTL_MS / SHARE_MAX_BYTES / Tool / ShareMeta / ShareCreateResult 有变动,
// 需同步到此文件。其余符号(TOOL_LABELS、ALL_TOOLS、SHARE_BASE_URL、桌面端 API 类型等)
// server 运行时用不到,不在此重复。

export type Tool = 'claude' | 'codex' | 'cursor' | 'trae';

export interface ShareMeta {
  id: string;
  name: string;
  description: string | null;
  sourceTool: Tool;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
}

export interface ShareCreateResult {
  id: string;
  url: string;
  expiresAt: number;
}

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 4MB:适配 Vercel 函数 4.5MB 请求体硬限制(阿里云本可更大,这里取两端都安全的值)
export const SHARE_MAX_BYTES = 4 * 1024 * 1024;
