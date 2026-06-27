import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 下载分享 zip。desktop installFromShare 从这里拉流。
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await getStore();
  const meta = await store.readMeta(id);
  if (!meta) return Response.json({ error: '链接不存在' }, { status: 404 });
  if (meta.expiresAt <= Date.now()) return Response.json({ error: '链接已过期' }, { status: 410 });

  const zip = await store.getZip(id);
  if (!zip) return Response.json({ error: 'zip 文件丢失' }, { status: 410 });
  return new Response(zip.stream, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${meta.name}.zip"`,
      'content-length': String(zip.size),
      'cache-control': 'no-store',
    },
  });
}
