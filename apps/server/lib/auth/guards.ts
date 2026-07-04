import { getCurrentUser } from './session';
import type { PublicUser } from '@skillkit/types';

/** 要求已登录,否则抛 Unauthorized(供 route handler 顶部调用)。 */
export async function requireUser(): Promise<{ user: PublicUser; v: number }> {
  const cur = await getCurrentUser();
  if (!cur) throw new Unauthorized();
  return cur;
}

// 简易 HTTP 错误:route handler catch 后由 errorResponse() 转成 JSON 响应。
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export class Unauthorized extends HttpError {
  constructor() {
    super(401, '未登录或会话已过期');
  }
}

/** 在 route handler 里把 HttpError / 未知错误统一转成 Response。 */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error('[api] unexpected error:', e);
  return Response.json({ error: '服务器错误' }, { status: 500 });
}
