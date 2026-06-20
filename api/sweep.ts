import { handle } from '@hono/node-server/vercel';
import { app } from './lib/app.js';

// GET /api/sweep —— cron 每日清理。
// 为什么单独成文件:本项目里 @vercel/node 的 catch-all(api/[...route].ts)只匹配单段
// 路径,多段直接 NOT_FOUND。故每个路由深度放一个函数文件,实际分发交给 Hono(按 req.url)。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export default handle(app);
