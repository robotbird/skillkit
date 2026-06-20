import { app } from '../lib/app.js';

// GET /api/share/:id —— 接收页(HTML)。说明见 ../sweep.ts。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export const fetch = (req: Request) => app.fetch(req);
