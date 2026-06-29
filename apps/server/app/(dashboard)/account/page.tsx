import { getCurrentUser } from '@/lib/auth/session';
import { PasswordForm } from './password-form';
import { LogoutAllButton } from './logout-all-button';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const { user } = cur;
  return (
    <div>
      <h1>账号管理</h1>
      <p className="muted">密码与会话安全。</p>

      <div className="section" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>修改密码</h2>
          <PasswordForm />
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2>会话</h2>
          <p className="muted">
            登出所有设备会使其他设备上的登录立即失效(当前设备也会退出,需重新登录)。
          </p>
          <LogoutAllButton />
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2>账号信息</h2>
          <div className="field">
            <label>邮箱</label>
            <input value={user.email} disabled />
          </div>
          <p className="muted">注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}</p>
        </div>
      </div>
    </div>
  );
}
