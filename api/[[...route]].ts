import { handle } from 'hono/vercel';
import { app } from './lib/app.js';

// Vercel serverless 入口:把同一个 Hono app 适配成 Vercel 函数。
// 阿里云/本地不经过这里(它们走 server/src/index.ts 的 serve())。
// [[...route]] 可选 catch-all:匹配 /api、/api/share、/api/share/:id/zip 等所有路径。
// 注意:app 等函数源码必须在 /api 内 —— @vercel/node 只编译 /api 目录内的 TS,
// /api 外的 server/src、shared 不会被编译,运行时拿不到 .js。
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default handle(app);
