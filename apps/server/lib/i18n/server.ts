import { headers } from 'next/headers';
import { detectLocale } from './detect';
import type { Locale } from './config';

/** Server Component 用:从当前请求的 accept-language 推断 locale。 */
export async function getLocaleFromHeaders(): Promise<Locale> {
  const h = await headers();
  return detectLocale(h.get('accept-language'));
}
