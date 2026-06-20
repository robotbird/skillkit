import { handle } from 'hono/vercel';
import { app } from '../server/src/app.js';

// Vercel serverless 入口:把同一个 Hono app 适配成 Vercel 函数。
// 阿里云/本地不经过这里(它们走 server/src/index.ts 的 serve())。
// [[...route]] 可选 catch-all:匹配 /api、/api/share、/api/share/:id/zip 等所有路径。
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default handle(app);
