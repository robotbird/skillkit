import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth/session';
import { listMyShares } from '@/lib/shares/repo';
import { SharesTable } from './shares-table';

export const dynamic = 'force-dynamic';

// 分享的 skill:列出当前用户分享过的 skill 短链(name / 链接 / 时间 / 大小 / ⋯ 删除)。
export default async function SharesPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'skillkit.net';
  const shares = await listMyShares(cur.user.id, `${proto}://${host}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">分享的 skill</h1>
        <p className="text-sm text-muted-foreground">你分享过的 skill 短链，共 {shares.length} 条。</p>
      </div>
      <SharesTable shares={shares} />
    </div>
  );
}
