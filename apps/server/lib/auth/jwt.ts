import { SignJWT, jwtVerify } from 'jose';
import { SESSION_TTL_S, type AuthSession } from '@skillkit/types';

// JWT 签名密钥(HS256)。生产必须通过 AUTH_SECRET 注入足够随机的值。
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'dev-insecure-secret-change-me',
);

/** 签发 session JWT 字符串(不碰 cookie;edge/node 通用)。 */
export async function signSession(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ v: tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(secret);
}

/** 验签 JWT,返回 session 负载(无 DB 查询;edge/node 通用)。供 middleware(edge)直接使用,
 *  绝不 import prisma / next/headers,以免污染 edge bundle。 */
export async function verifySession(token: string | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub;
    if (!userId) return null;
    return { userId, v: typeof payload.v === 'number' ? payload.v : 0 };
  } catch {
    return null;
  }
}
