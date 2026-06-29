import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/jwt';
import { SESSION_COOKIE } from '@skillkit/types';

// 登录守卫(edge runtime;Next 16 起中间件文件约定更名为 proxy,原 middleware.ts 已弃用)。
// 只拦个人中心页面(根 / 与 /teams/* 等);matcher 负向断言放行所有公开路径:
// /share /sweep /api /login /register,以及 _next / favicon / 带扩展名的静态文件。
// 只 import edge-safe 的 jwt.ts(无 prisma / next/headers),避免污染 edge bundle。
export const config = {
  matcher: ['/((?!share|sweep|api|login|register|_next|favicon|.*\\.).*)'],
};

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}
