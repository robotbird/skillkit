import { serve } from '@hono/node-server';
import { app } from './app.js';
import { getStore } from './store.js';

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
  // 启动跑一次清理,之后每小时一次。
  // 仅本地/阿里云长驻进程用;Vercel serverless 无长驻进程,改走 vercel.json 的 /api/sweep cron。
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
