import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { issueSession } from '@/lib/auth/session';
import { changePasswordSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 修改密码:验证当前密码 → hash 新密码 → bump tokenVersion(其他设备旧 JWT 立即失效)
// → 重签当前 session(当前设备保持登录)。
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '参数不合法' },
        { status: 400 },
      );
    }
    const { currentPassword, newPassword } = parsed.data;
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true, tokenVersion: true },
    });
    if (!full) return Response.json({ error: '用户不存在' }, { status: 404 });
    if (!(await verifyPassword(currentPassword, full.passwordHash))) {
      return Response.json({ error: '当前密码不正确' }, { status: 400 });
    }
    const newHash = await hashPassword(newPassword);
    const newV = full.tokenVersion + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, tokenVersion: newV },
    });
    // 重签当前 session 为新版本;其他设备持有的旧版本 JWT 会在 getCurrentUser 校验时失效。
    await issueSession(user.id, newV);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
