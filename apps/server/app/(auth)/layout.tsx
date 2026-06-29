import type { ReactNode } from 'react';

// 登录/注册用独立 route group:无登录守卫(middleware 放行 /login /register),居中卡片布局。
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="center-screen">
      <div className="auth-card">{children}</div>
    </div>
  );
}
