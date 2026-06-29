import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/session';
import { LogoutButton } from './logout-button';

export const dynamic = 'force-dynamic';

// 顶栏 + 容器。middleware 已守卫,这里再读一次当前用户渲染昵称(cookie 失效则兜底为「我」)。
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cur = await getCurrentUser();
  return (
    <>
      <header className="topbar wrap">
        <Link href="/" className="brand">
          <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
            <rect width="24" height="24" rx="6" fill="#ffb14a" />
            <path fill="#1a1410" d="M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z" />
          </svg>
          Skillkit
        </Link>
        <nav className="right">
          <Link href="/teams">团队</Link>
          <Link href="/">{cur?.user.name || cur?.user.email || '我'}</Link>
          <LogoutButton />
        </nav>
      </header>
      <main className="wrap page">{children}</main>
    </>
  );
}
