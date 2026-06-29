import { prisma } from '@/lib/db';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { clearSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 全设备登出:bump tokenVersion(其他设备旧 JWT 失效)+ 清除当前 session(自己也退出)。
export async function POST() {
  try {
    const { user } = await requireUser();
    const u = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    if (!u) return Response.json({ error: '用户不存在' }, { status: 404 });
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: u.tokenVersion + 1 },
    });
    await clearSession();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
