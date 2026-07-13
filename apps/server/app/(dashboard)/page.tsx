import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { formatBytes } from '@/lib/format';
import { getLocaleFromHeaders } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n/t';
import { EditNameForm } from './edit-name-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

// 总览:问候 + 分享数 + 账号摘要(昵称可编辑)。
export default async function OverviewPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const locale = await getLocaleFromHeaders();
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const { user } = cur;
  const [shareCount, agg] = await Promise.all([
    prisma.share.count({ where: { userId: user.id } }),
    prisma.share.aggregate({
      where: { userId: user.id },
      _sum: { sizeBytes: true },
    }),
  ]);
  const totalBytes = agg._sum.sizeBytes ?? 0;
  const displayName = user.name || user.email.split('@')[0];
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.greeting', { name: displayName })}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      <div className="flex gap-8">
        <div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">{shareCount}</div>
          <div className="text-xs text-muted-foreground">{t('dashboard.sharesStatLabel')}</div>
        </div>
        <div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatBytes(totalBytes)}
          </div>
          <div className="text-xs text-muted-foreground">{t('dashboard.storageLabel')}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.sharesCardTitle')}</CardTitle>
          <CardDescription>{t('dashboard.sharesCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {t('dashboard.sharesCountPrefix')}<span className="font-medium text-foreground">{shareCount}</span>{t('dashboard.sharesCountSuffix')}
          </div>
          <Link
            href="/shares"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t('dashboard.viewAll')}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.accountCardTitle')}</CardTitle>
          <CardDescription>{t('dashboard.accountCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <EditNameForm initial={user.name} />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('dashboard.emailLabel')}</span>
            <span className="text-foreground">{user.email}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.joinedAt', {
              date: new Date(user.createdAt).toLocaleDateString(dateLocale),
            })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
