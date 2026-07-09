'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// 个人中心左侧导航:极简两项(对齐 desktop 设置侧栏 Codex 风格)。
const ITEMS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: '/', label: '总览', match: (p) => p === '/' },
  { href: '/shares', label: '分享的 skill', match: (p) => p.startsWith('/shares') },
];

export function Nav() {
  const pathname = usePathname();
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
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
