import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { issueSession, toPublicUser } from '@/lib/auth/session';
import { errorResponse } from '@/lib/auth/guards';
import { loginSchema } from '@/lib/validation';
import { detectLocale } from '@/lib/i18n/detect';
import { translate } from '@/lib/i18n/t';
import type { AuthResponse } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 登录:无论用户不存在还是密码错,统一返回「邮箱或密码错误」(防用户枚举)。
export async function POST(req: NextRequest) {
  const locale = detectLocale(req.headers.get('accept-language'));
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema(locale).safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? translate(locale, 'errors.invalidParams') },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: translate(locale, 'errors.invalidCredentials') }, { status: 401 });
    }
    await issueSession(user.id, user.tokenVersion);
    const res: AuthResponse = { user: toPublicUser(user) };
    return Response.json(res);
  } catch (e) {
    return errorResponse(e, locale);
  }
}
