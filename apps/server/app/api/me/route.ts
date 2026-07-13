import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { toPublicUser } from '@/lib/auth/session';
import { updateMeSchema } from '@/lib/validation';
import { detectLocale } from '@/lib/i18n/detect';
import { translate } from '@/lib/i18n/t';
import type { AuthResponse } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 当前登录用户(GET)。requireUser 已做 cookie 验签 + DB 查询。
export async function GET() {
  try {
    const { user } = await requireUser();
    const res: AuthResponse = { user };
    return Response.json(res);
  } catch (e) {
    return errorResponse(e);
  }
}

// 改昵称(PATCH)。name 为 string 或 null(清空)。
export async function PATCH(req: NextRequest) {
  const locale = detectLocale(req.headers.get('accept-language'));
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = updateMeSchema(locale).safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? translate(locale, 'errors.invalidParams') },
        { status: 400 },
      );
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name ?? null },
    });
    const res: AuthResponse = { user: toPublicUser(updated) };
    return Response.json(res);
  } catch (e) {
    return errorResponse(e, locale);
  }
}
