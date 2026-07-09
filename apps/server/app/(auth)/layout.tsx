import type { ReactNode } from 'react';
import { Logo } from '@/components/logo';

// 登录/注册:无登录守卫(proxy 放行 /login /register),居中卡片 + 顶部 logo。
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
