import { getCurrentUser } from './session';
import type { PublicUser } from '@skillkit/types';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { translate } from '@/lib/i18n/t';

/** 要求已登录,否则抛 Unauthorized(供 route handler 顶部调用)。 */
export async function requireUser(): Promise<{ user: PublicUser; v: number }> {
  const cur = await getCurrentUser();
  if (!cur) throw new Unauthorized();
  return cur;
}

// 简易 HTTP 错误:route handler catch 后由 errorResponse() 转成 JSON 响应。
// message 用稳定 code(如 'unauthorized'),由 errorResponse 按请求 locale 翻译。
export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
export class Unauthorized extends HttpError {
  constructor() {
    super(401, 'unauthorized');
  }
}

/** 在 route handler 里把 HttpError / 未知错误统一转成 Response(按 locale 翻译文案)。 */
export function errorResponse(e: unknown, locale: Locale = DEFAULT_LOCALE): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: translate(locale, `errors.${e.code}`) }, { status: e.status });
  }
  console.error('[api] unexpected error:', e);
  return Response.json({ error: translate(locale, 'errors.server') }, { status: 500 });
}
