import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { listMyTeams } from '@/lib/teams/repo';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const cur = await getCurrentUser();
  if (!cur) return null;
  const teams = await listMyTeams(cur.user.id);

  return (
    <div>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>我的团队</h1>
        <Link href="/teams/new" className="btn btn-primary btn-sm">
          新建团队
        </Link>
      </div>
      {teams.length === 0 ? (
        <div className="empty">还没有团队。点击右上角「新建团队」开始。</div>
      ) : (
        <div className="list">
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="list-item">
              <div className="main">
                <span className="title">{t.name}</span>
                <span className="sub">
                  {t.memberCount} 成员 · {t.skillCount} 个 skill · /{t.slug}
                </span>
              </div>
              <span className={`chip ${t.role === 'owner' ? '' : 'muted'}`}>
                {t.role === 'owner' ? '拥有者' : '成员'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
