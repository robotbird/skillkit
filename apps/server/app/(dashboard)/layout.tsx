import type { ReactNode } from 'react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { Logo } from '@/components/logo';
import { UserMenu } from './user-menu';
import { DashboardShell } from './shell';

export const dynamic = 'force-dynamic';

// 个人中心外壳:顶部 topbar(左 logo / 右头像)+ 下方主体(左导航/右内容,
// 或 /account 子页形态)。proxy 已守卫;这里再读一次用户渲染头像与昵称。
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
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
