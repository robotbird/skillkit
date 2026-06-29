import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skillkit',
  description: 'Skillkit 分享与团队 skill 管理',
};

// 根 layout:服务于根 page 与 (dashboard)/(auth)。分享接收页 /share/[id] 走 route handler,
// 返回完整 HTML 文档、不经过此 layout(因此 globals.css 不影响它)。
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
