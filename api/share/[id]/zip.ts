import { handle } from '@hono/node-server/vercel';
import { app } from '../../lib/app.js';

// GET /api/share/:id/zip —— 下载 zip。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export default handle(app);
