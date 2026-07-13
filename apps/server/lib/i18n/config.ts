// i18n 基础常量。本期仅按浏览器语言自动判断(无手动切换)。

export type Locale = 'zh' | 'en';

/** 检测不到 / 既非中也非英时的回退语言(面向国际)。 */
export const DEFAULT_LOCALE: Locale = 'en';

export const SUPPORTED_LOCALES: Locale[] = ['zh', 'en'];

/** 预留:若将来加手动切换,把用户选择写入此 cookie 覆盖浏览器语言。本期不写。 */
export const LOCALE_COOKIE = 'skillkit-locale';
