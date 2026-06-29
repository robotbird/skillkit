import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { issueSession, toPublicUser } from '@/lib/auth/session';
import { errorResponse } from '@/lib/auth/guards';
import { loginSchema } from '@/lib/validation';
import type { AuthResponse } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 登录:无论用户不存在还是密码错,统一返回「邮箱或密码错误」(防用户枚举)。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '参数不合法' },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: '邮箱或密码错误' }, { status: 401 });
    }
    await issueSession(user.id, user.tokenVersion);
    const res: AuthResponse = { user: toPublicUser(user) };
    return Response.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}
