import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { signSession } from '@/lib/auth/jwt';
import { toPublicUser } from '@/lib/auth/session';
import { errorResponse } from '@/lib/auth/guards';
import { loginSchema } from '@/lib/validation';
import { detectLocale } from '@/lib/i18n/detect';
import { translate } from '@/lib/i18n/t';
import type { TokenAuthResponse } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 桌面端 token 鉴权登录：校验邮箱+密码后签发 bearer token（与 web 的 cookie session 同源 JWT）。
// 不写 cookie —— 桌面端拿到 token 自行安全存储（Electron safeStorage），后续以
// `Authorization: Bearer <token>` 调 /api/me 等接口（getCurrentUser 已支持 bearer）。
// 失效复用 tokenVersion（改密 / 全设备登出会 bump）。
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
    const token = await signSession(user.id, user.tokenVersion);
    const res: TokenAuthResponse = { token, user: toPublicUser(user) };
    return Response.json(res);
  } catch (e) {
    return errorResponse(e, locale);
  }
}
