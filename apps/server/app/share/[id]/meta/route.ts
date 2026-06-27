import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

// 分享元数据(JSON)。desktop 在安装前用它展示 skill 名称等。
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await getStore();
  const meta = await store.readMeta(id);
  if (!meta) return Response.json({ error: '链接不存在' }, { status: 404 });
  if (meta.expiresAt <= Date.now()) return Response.json({ error: '链接已过期' }, { status: 410 });
  return Response.json(meta);
}
