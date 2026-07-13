'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/components/locale-provider';
import { Nav } from './nav';

// dashboard 主体外壳:左侧统一侧栏(固定 w-52,保证内容区宽度跨页一致)+ 右侧功能区。
// /account(经右上角头像进入)侧栏内容改为「‹ 返回」回到总览,而非导航项。
export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useT();
  const isAccount = pathname === '/account';
  return (
    <div className="mx-auto flex w-full max-w-6xl">
      <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-52 shrink-0 p-3">
        {isAccount ? (
          <Link
            href="/"
            className="ml-auto flex w-fit items-center gap-1 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t('shell.back')}
          </Link>
        ) : (
          <Nav />
        )}
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
