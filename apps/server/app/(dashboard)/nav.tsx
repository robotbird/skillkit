'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useT } from '@/components/locale-provider';

// 个人中心左侧导航:极简两项(对齐 desktop 设置侧栏 Codex 风格)。
const ITEMS: { href: string; key: string; match: (p: string) => boolean }[] = [
  { href: '/', key: 'nav.overview', match: (p) => p === '/' },
  { href: '/shares', key: 'nav.shares', match: (p) => p.startsWith('/shares') },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="flex flex-col gap-1">
      {ITEMS.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={cn(
            'rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            it.match(pathname) && 'bg-muted font-medium text-foreground',
          )}
        >
          {t(it.key)}
        </Link>
      ))}
    </nav>
  );
}
