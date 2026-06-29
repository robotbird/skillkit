import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/auth/session';
import { Sidebar } from './sidebar';

export const dynamic = 'force-dynamic';

// 左侧菜单 + 右侧内容(GitHub 风格)。middleware(proxy) 已守卫;这里再读一次用户渲染 sidebar。
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cur = await getCurrentUser();
  return (
    <div className="app-shell">
      <Sidebar email={cur?.user.email ?? ''} name={cur?.user.name ?? null} />
      <main className="main">{children}</main>
    </div>
  );
}
