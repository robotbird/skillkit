import type { NextRequest } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { listMyShares } from '@/lib/shares/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 当前用户的分享列表(GET)。origin 由请求头拼出,用于生成完整短链。
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'skillkit.net';
    const origin = `${proto}://${host}`;
    const shares = await listMyShares(user.id, origin);
    return Response.json(shares);
  } catch (e) {
    return errorResponse(e);
  }
}
