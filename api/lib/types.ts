// Vercel 函数 / 阿里云 server 共用的运行时常量与类型。
//
// 注意:这是 shared/types.ts 的「函数运行时子集」副本。shared/types.ts 同时被
// electron 主进程与 renderer 通过 @shared alias 引用,但它在 /api 之外,@vercel/node
// 不会编译它(运行时拿不到 .js),所以函数自包含在这里。若 shared/types.ts 里的
// SHARE_TTL_MS / SHARE_MAX_BYTES / Tool / ShareMeta / ShareCreateResult 有变动,
// 需同步到此文件。其余符号(TOOL_LABELS、ALL_TOOLS、SHARE_BASE_URL、桌面端 API 类型等)
// 函数运行时用不到,不在此重复。

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
