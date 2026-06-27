import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// Cron 清理过期分享(Vercel cron 每日命中 /sweep)。过期分享读时已返回 410,
// 这里只是清理 Blob 省存储。用 CRON_SECRET 鉴权。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: '未配置 CRON_SECRET,清理未启用' }, { status: 503 });
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return Response.json({ error: '未授权' }, { status: 401 });
  const n = await (await getStore()).sweepExpired();
  return Response.json({ swept: n });
}
