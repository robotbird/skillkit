import { handle } from '@hono/node-server/vercel';
import { app } from '../../lib/app.js';

// GET /api/share/:id/meta —— JSON 元数据。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export default handle(app);
