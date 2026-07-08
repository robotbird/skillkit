import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { signSession, verifySession } from './jwt';
import { SESSION_COOKIE, SESSION_TTL_S, type AuthSession, type PublicUser } from '@skillkit/types';

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

/** 签发 session JWT 并写入 httpOnly cookie(注册/登录成功后调用)。
 *  返回 token 字符串,供需要拿到 token 的调用方(如桌面 token 端点)使用。 */
export async function issueSession(userId: string, tokenVersion: number): Promise<string> {
  const token = await signSession(userId, tokenVersion);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
  return token;
}

/** 清除 session cookie(登出)。 */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 从当前请求取并验签 session,再查 DB 拿当前用户(route handler 内用)。
 *  优先读 cookie(web 前端);缺失则读 `Authorization: Bearer <jwt>`(桌面端 token 鉴权)。
 *  每次都重新查 DB(拿最新 tokenVersion / 昵称);tokenVersion 不匹配则视为失效。 */
export async function getCurrentUser(): Promise<{ user: PublicUser; v: number } | null> {
  const session = await readSessionToken();
  if (!session) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, createdAt: true, tokenVersion: true },
  });
  if (!u || u.tokenVersion !== session.v) return null;
  return { user: toPublicUser(u), v: session.v };
}

/** 取 session 负载:先 cookie,再 bearer 头。两者皆无 / 验签失败返回 null。 */
async function readSessionToken(): Promise<AuthSession | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (cookie) return verifySession(cookie);
  const h = await headers();
  const auth = h.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) {
    return verifySession(auth.replace(/^bearer\s+/i, '').trim());
  }
  return null;
}
