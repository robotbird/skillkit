'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';
import { translate } from '@/lib/i18n/t';

type TFn = (key: string, vars?: Record<string, string | number>) => string;
type LocaleCtx = { locale: Locale; t: TFn };

const LocaleContext = createContext<LocaleCtx | null>(null);

/**
 * 把 server 端按 Accept-Language 算好的 locale 透传给所有 Client Component。
 * Client 组件只读 context,**绝不**直接读 navigator.language —— 避免 hydration 闪烁。
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<LocaleCtx>(
    () => ({ locale, t: (key, vars) => translate(locale, key, vars) }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const ctx = useContext(LocaleContext);
  return ctx?.locale ?? DEFAULT_LOCALE;
}

export function useT(): LocaleCtx {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Provider 缺失属于接线错误 —— 直接抛,比静默回退更容易发现。
    throw new Error('useT must be used within <LocaleProvider>');
  }
  return ctx;
}
