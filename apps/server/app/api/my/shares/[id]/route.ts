import type { NextRequest } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { deleteMyShare } from '@/lib/shares/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 删除一条分享(DELETE)。仅属主可删;非属主或不存在返回 404。
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const ok = await deleteMyShare(id, user.id);
    if (!ok) return Response.json({ error: '分享不存在或无权操作' }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
