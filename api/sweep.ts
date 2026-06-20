import { app } from './lib/app.js';

// GET /api/sweep —— cron 每日清理。
// 单独成文件:@vercel/node 的 catch-all 在本项目只匹配单段路径,故每个路由深度一个文件,
// 路由交给 Hono(按 req.url + basePath('/api'))。
// 用 Web API 的命名 fetch 导出(而非 @hono/node-server/vercel 的 Node 风格 handle):
// 后者在 Other 框架下读 POST body 会挂住(FUNCTION_INVOCATION_TIMEOUT);Web API 直接拿
// web Request,body 已就位,formData() 不会 stall。
export const config = { runtime: 'nodejs', maxDuration: 60 };
export const fetch = (req: Request) => app.fetch(req);
