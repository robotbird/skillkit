import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { messages, type MessageKey } from './messages';
import { SETTING_KEYS, type Locale } from '@shared/types';

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** 取文案；缺失回退到 zh 再回退到 key 本身。支持 {name} 占位符替换。 */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'zh',
  setLocale: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('zh');

  // 挂载时从 meta KV 读已保存的语言偏好
  useEffect(() => {
    window.skillkit
      .getSetting(SETTING_KEYS.locale)
      .then((v) => {
        if (v === 'zh' || v === 'en') setLocaleState(v);
      })
      .catch(() => {});
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    window.skillkit.setSetting(SETTING_KEYS.locale, l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let s = messages[locale][key] ?? messages.zh[key] ?? key;
      if (vars) {
        for (const k of Object.keys(vars)) {
          s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
        }
      }
      return s;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
