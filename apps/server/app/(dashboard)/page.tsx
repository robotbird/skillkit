import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { EditNameForm } from './edit-name-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

// 总览:问候 + 分享数 + 账号摘要(昵称可编辑)。
export default async function OverviewPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const { user } = cur;
  const shareCount = await prisma.share.count({ where: { userId: user.id } });
  const displayName = user.name || user.email.split('@')[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">你好，{displayName}</h1>
        <p className="text-sm text-muted-foreground">管理你的账号与分享的 skill。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>分享</CardTitle>
          <CardDescription>你分享过的 skill 短链。</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            已分享 <span className="font-medium text-foreground">{shareCount}</span> 个 skill
          </div>
          <Link
            href="/shares"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            查看 →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>账号</CardTitle>
          <CardDescription>昵称与邮箱。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditNameForm initial={user.name} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>邮箱</span>
            <span className="text-foreground">{user.email}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
