import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { issueSession, toPublicUser } from '@/lib/auth/session';
import { errorResponse } from '@/lib/auth/guards';
import { registerSchema } from '@/lib/validation';
import type { AuthResponse } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 注册:邮箱 + 密码。成功后直接签发 session(httpOnly cookie),无需再调登录。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '参数不合法' },
        { status: 400 },
      );
    }
    const { email, password, name } = parsed.data;
    const emailLower = email.toLowerCase();
    const exists = await prisma.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });
    if (exists) return Response.json({ error: '该邮箱已注册' }, { status: 409 });

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email: emailLower, passwordHash, name: name ?? null },
    });
    await issueSession(user.id, user.tokenVersion);
    const res: AuthResponse = { user: toPublicUser(user) };
    return Response.json(res, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
