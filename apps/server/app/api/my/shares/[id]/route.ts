import type { NextRequest } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { deleteMyShare } from '@/lib/shares/repo';
import { detectLocale } from '@/lib/i18n/detect';
import { translate } from '@/lib/i18n/t';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 删除一条分享(DELETE)。仅属主可删;非属主或不存在返回 404。
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const locale = detectLocale(req.headers.get('accept-language'));
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const ok = await deleteMyShare(id, user.id);
    if (!ok) return Response.json({ error: translate(locale, 'errors.shareNotFound') }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e, locale);
  }
}
