import { requireUser, errorResponse } from '@/lib/auth/guards';
import { listMyShares } from '@/lib/shares/repo';
import { SHARE_BASE_URL } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 当前用户的分享列表(GET)。短链用分享服务稳定基地址 SHARE_BASE_URL 拼接(而非当前 host)。
export async function GET() {
  try {
    const { user } = await requireUser();
    const shares = await listMyShares(user.id, SHARE_BASE_URL);
    return Response.json(shares);
  } catch (e) {
    return errorResponse(e);
  }
}
