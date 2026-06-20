import { serve } from '@hono/node-server';
import { handle } from 'hono/vercel';
// app/store 现与本文件同在 server/src/ 内 —— server 自包含,不再外部引用 api/lib 或 shared。
// Vercel(legacy builds+routes)与阿里云/本地共用这一个入口,按 process.env.VERCEL 分支。
import { app } from './app.js';
import { getStore } from './store.js';

const isVercel = !!process.env.VERCEL;

if (isVercel) {
  // Vercel serverless:无长驻进程,不 serve / 不 setInterval。
  // 过期清理改走 vercel.json 的 /sweep cron(命中 app 的 /sweep 路由)。
  // 默认导出 handle(app) 由 @vercel/node 适配为 Vercel 函数(见文件末尾)。
} else {
  // 命令行:手动删除一个 share(node src/index.ts --delete <id>)
  if (process.argv[2] === '--delete' && process.argv[3]) {
    const id = process.argv[3];
    getStore()
      .then((s) => s.deleteShare(id))
      .then(() => {
        console.log(`removed ${id}`);
        process.exit(0);
      })
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  } else {
    // 启动跑一次清理,之后每小时一次。仅本地/阿里云长驻进程用。
    getStore()
      .then((s) => s.sweepExpired())
      .then((n) => {
        if (n > 0) console.log(`[startup] removed ${n} expired share(s)`);
      })
      .catch((e) => console.error('[startup] sweep failed', e));

    const cleanupTimer = setInterval(async () => {
      try {
        const n = await (await getStore()).sweepExpired();
        if (n > 0) console.log(`[cleanup] removed ${n} expired share(s)`);
      } catch (e) {
        console.error('[cleanup] failed', e);
      }
    }, 60 * 60 * 1000);
    cleanupTimer.unref?.();

    const port = Number(process.env.PORT || 8787);
    const host = process.env.HOST || '0.0.0.0'; // 阿里云需对外可达;本地 127.0.0.1 仍能访问
    serve({ fetch: app.fetch, port, hostname: host }, (info) => {
      console.log(`Skillkit share server on http://${info.address}:${info.port}`);
    });
  }
}

// Vercel 入口:handle(app) 把同一个 Hono app 适配成 Vercel 函数。
// routes catch-all 让函数收到原始路径(如 /share/eweqj),app 路由不带 basePath。
// 阿里云/本地不使用此导出(无副作用,仅为 Vercel 编译)。
export default handle(app);
