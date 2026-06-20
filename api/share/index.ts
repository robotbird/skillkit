import { app } from '../lib/app.js';

// POST /api/share —— 上传创建分享。说明见 ../../sweep.ts。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export const fetch = (req: Request) => app.fetch(req);
