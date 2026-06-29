import { clearSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 登出:仅清除当前设备 cookie(JWT 无状态,不做全设备吊销)。
export async function POST() {
  await clearSession();
  return Response.json({ ok: true });
}
