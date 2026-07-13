import { DEFAULT_LOCALE, type Locale } from './config';

/**
 * 解析 Accept-Language → 'zh' | 'en'。按 q 降序遍历,取第一个主子标签为 zh/en 的;
 * 都不匹配 / 无头 → DEFAULT_LOCALE('en')。纯函数,无 next/ 依赖,edge 与 nodejs 通用。
 */
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...qparts] = part.trim().split(';');
      const qEntry = qparts.find((p) => p.trim().startsWith('q='));
      const q = qEntry ? Number.parseFloat(qEntry.split('=')[1]) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    })
    .filter((p) => p.tag.length > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const primary = tag.split('-')[0];
    if (primary === 'zh') return 'zh';
    if (primary === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}
