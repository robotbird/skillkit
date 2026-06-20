import { app } from './lib/app.js';

// Vercel serverless 入口(Web 标准 API):命名导出 fetch(request) => Response。
// [[...route]] 可选 catch-all:匹配 /api、/api/share、/api/share/:id/zip 等所有路径。
// 阿里云/本地不经过这里(它们走 server/src/index.ts 的 serve())。
//
// 为什么不用 `export default handle(app)`(hono/vercel):当前 @vercel/node 把 default
// export 一律当作 Node 风格的 (req, res) => void,会忽略返回的 Response —— hono/vercel 的
// handle 正是返回 Response —— 结果函数被调用但客户端收到 404/空响应(警告:"default
// export returned a `Response`")。改用命名 `fetch`(Web 标准)即被正确识别。
// app 源码必须在 /api 内 —— @vercel/node 只编译 /api 目录内的 TS。
export const config = { runtime: 'nodejs', maxDuration: 60 };

export const fetch = (req: Request) => app.fetch(req);
