import { getCurrentUser } from '@/lib/auth/session';
import { getLocaleFromHeaders } from '@/lib/i18n/server';
import { translate } from '@/lib/i18n/t';
import { PasswordForm } from './password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

// 账号设置:账号信息(只读)+ 修改密码。保持最简(原「会话/登出所有设备」已移除)。
export default async function AccountPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const locale = await getLocaleFromHeaders();
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const { user } = cur;
  const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('account.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('account.infoCardTitle')}</CardTitle>
          <CardDescription>{t('account.infoCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="account-email">{t('account.emailLabel')}</FieldLabel>
            <Input id="account-email" value={user.email} disabled />
          </Field>
          <p className="text-xs text-muted-foreground">
            {t('account.joinedAt', {
              date: new Date(user.createdAt).toLocaleDateString(dateLocale),
            })}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('account.passwordCardTitle')}</CardTitle>
          <CardDescription>{t('account.passwordCardDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
