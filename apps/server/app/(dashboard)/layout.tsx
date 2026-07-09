import type { ReactNode } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { Logo } from '@/components/logo';
import { Nav } from './nav';
import { UserMenu } from './user-menu';

export const dynamic = 'force-dynamic';

// 个人中心外壳:顶部 topbar(左 logo / 右头像)+ 下方左右分栏(左导航 / 右内容)。
// proxy 已守卫;这里再读一次用户渲染头像与昵称。
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cur = await getCurrentUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <Link href="/" className="text-foreground">
          <Logo />
        </Link>
        <UserMenu name={cur?.user.name ?? null} email={cur?.user.email ?? ''} />
      </header>
      <div className="mx-auto flex w-full max-w-6xl">
        <aside className="sticky top-14 h-[calc(100vh-3.5rem)] w-52 shrink-0 p-3">
          <Nav />
        </aside>
        <main className="min-w-0 flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
