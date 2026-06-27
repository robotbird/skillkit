import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Skillkit',
  description: 'Skillkit 分享与团队 skill 管理',
};

// 根 layout:仅服务于根 page 与未来的 (dashboard)。分享接收页 /share/[id] 走 route handler,
// 返回完整 HTML 文档,不经过此 layout。
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
