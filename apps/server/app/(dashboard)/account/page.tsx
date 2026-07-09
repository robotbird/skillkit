import { getCurrentUser } from '@/lib/auth/session';
import { PasswordForm } from './password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export const dynamic = 'force-dynamic';

// 账号设置:账号信息(只读)+ 修改密码。保持最简(原「会话/登出所有设备」已移除)。
export default async function AccountPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const { user } = cur;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">账号设置</h1>
        <p className="text-sm text-muted-foreground">账号信息与密码。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
          <CardDescription>你的账号基本资料。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel htmlFor="account-email">邮箱</FieldLabel>
            <Input id="account-email" value={user.email} disabled />
          </Field>
          <p className="text-xs text-muted-foreground">
            注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>修改密码</CardTitle>
          <CardDescription>更新后其他设备需用新密码重新登录。</CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
