import { getCurrentUser } from '@/lib/auth/session';
import { EditNameForm } from './edit-name-form';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const { user } = cur;
  return (
    <div>
      <h1>个人信息</h1>
      <p className="muted">账号信息与昵称。</p>
      <div className="section" style={{ marginTop: 18 }}>
        <div className="card">
          <div className="field">
            <label>邮箱</label>
            <input value={user.email} disabled />
          </div>
          <EditNameForm initial={user.name} />
          <p className="muted">注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}</p>
        </div>
      </div>
    </div>
  );
}
