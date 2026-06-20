import { handle } from '@hono/node-server/vercel';
import { app } from './lib/app.js';

// Vercel serverless 入口(Node 运行时)。
// 用 @hono/node-server/vercel 的 handle:它返回 Node 风格 (req, res) => void,把 Hono
// 响应直接写进 res —— 这是 nodejs 运行时 + default export 的标准用法。
//   不要用 hono/vercel 的 handle:那是 Web/Edge 风格,返回 Response;@vercel/node 会把
//   default export 当成 (req,res)=>void 而忽略返回的 Response(警告 "default export
//   returned a Response"),函数跑了但客户端拿不到响应。
//   也不要用命名 `export const fetch`:当前 @vercel/node 下,[[...route]] catch-all 对
//   Web-API fetch 导出的文件只匹配单段路径(/api/share 通,/api/share/x/y 不通,返回
//   Vercel NOT_FOUND)。default + Node 风格 handle 才能让 catch-all 正确匹配所有深度。
// [[...route]] 可选 catch-all:匹配 /api、/api/share、/api/share/:id/zip 等所有路径。
// 阿里云/本地不经过这里(它们走 server/src/index.ts 的 serve())。
// app 源码必须在 /api 内 —— @vercel/node 只编译 /api 目录内的 TS。
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default handle(app);
