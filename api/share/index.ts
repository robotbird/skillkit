import { handle } from '@hono/node-server/vercel';
import { app } from '../lib/app.js';

// POST /api/share —— 上传创建分享。
// 单独成文件(见 ../sweep.ts 的说明):文件位置决定哪些路径进得来,路由交给 Hono。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export default handle(app);
