import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { getLocaleFromHeaders } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n/t';
import { LocaleProvider } from '@/components/locale-provider';

// 根 layout:服务于根 page 与 (dashboard)/(auth)。分享接收页 /share/[id] 走 route handler,
// 返回完整 HTML 文档、不经过此 layout(因此 globals.css 与 LocaleProvider 都不影响它)。
// locale 按浏览器 Accept-Language 自动判断,默认英文。
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromHeaders();
  return {
    title: 'Skillkit',
    description: translate(locale, 'meta.description'),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocaleFromHeaders();
  return (
    <html lang={locale === 'zh' ? 'zh-CN' : 'en'}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
