import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { signSession, verifySession } from './jwt';
import { SESSION_COOKIE, SESSION_TTL_S, type PublicUser } from '@skillkit/types';

// node 运行时(cookie + prisma)。middleware(edge)请直接 import './jwt',不要 import 本文件。
export { verifySession };

/** Prisma User(选择字段)→ 对外 PublicUser(DateTime → epoch ms)。 */
export function toPublicUser(u: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}): PublicUser {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt.getTime() };
}

/** 签发 session JWT 并写入 httpOnly cookie(注册/登录成功后调用)。 */
export async function issueSession(userId: string, tokenVersion: number): Promise<void> {
  const token = await signSession(userId, tokenVersion);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
}

/** 清除 session cookie(登出)。 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 从当前请求 cookie 取并验签 session,再查 DB 拿当前用户(route handler 内用)。
 *  每次都重新查 DB(拿最新 tokenVersion / 昵称);tokenVersion 不匹配则视为失效。 */
export async function getCurrentUser(): Promise<{ user: PublicUser; v: number } | null> {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, createdAt: true, tokenVersion: true },
  });
  if (!u || u.tokenVersion !== session.v) return null;
  return { user: toPublicUser(u), v: session.v };
}
