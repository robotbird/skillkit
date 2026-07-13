import { getCurrentUser } from '@/lib/auth/session';
import { getLocaleFromHeaders } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n/t';
import { listMyShares } from '@/lib/shares/repo';
import { SharesTable } from './shares-table';
import { SHARE_BASE_URL } from '@skillkit/types';

export const dynamic = 'force-dynamic';

// 分享的 skill:列出当前用户分享过的 skill 短链(name / 链接 / 时间 / 大小 / ⋯ 删除)。
// 短链用分享服务稳定基地址 SHARE_BASE_URL 拼接(而非当前 host),避免 account 子域污染链接。
export default async function SharesPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const locale = await getLocaleFromHeaders();
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const shares = await listMyShares(cur.user.id, SHARE_BASE_URL);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('shares.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('shares.subtitle', { count: shares.length })}</p>
      </div>
      <SharesTable shares={shares} />
    </div>
  );
}
