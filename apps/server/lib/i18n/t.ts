import { DEFAULT_LOCALE, type Locale } from './config';
import { dict } from './dictionaries';

/**
 * 按 locale 取文案,{name}/{count} 形式的占位符用 vars 替换。
 * 缺 key 先回退到 DEFAULT_LOCALE,再缺回退到 key 本身(开发期可见,不崩)。
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let str = dict[locale]?.[key] ?? dict[DEFAULT_LOCALE]?.[key] ?? key;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] != null ? String(vars[k]) : '',
    );
  }
  return str;
}
