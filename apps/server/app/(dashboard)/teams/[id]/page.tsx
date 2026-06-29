import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { getTeamDetail } from '@/lib/teams/repo';
import { SkillRow } from './skill-row';

export const dynamic = 'force-dynamic';

export default async function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cur = await getCurrentUser();
  if (!cur) return null;
  const team = await getTeamDetail(id, cur.user.id);
  if (!team) notFound();
  const isOwner = team.role === 'owner';

  return (
    <div>
      <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{team.name}</h1>
        <span className={`chip ${isOwner ? '' : 'muted'}`}>{isOwner ? '拥有者' : '成员'}</span>
      </div>
      <p className="muted" style={{ marginBottom: 18 }}>
        /{team.slug} · {team.members.length} 成员
      </p>

      <div className="section">
        <div className="actions" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Skill 清单（{team.skills.length}）</h2>
          <Link href={`/teams/${team.id}/skills/new`} className="btn btn-primary btn-sm">
            添加 skill
          </Link>
        </div>
        {team.skills.length === 0 ? (
          <div className="empty">还没有 skill。添加一个 GitHub 仓库或分享链接。</div>
        ) : (
          <div className="list">
            {team.skills.map((s) => (
              <SkillRow key={s.id} skill={s} />
            ))}
          </div>
        )}
      </div>

      <div className="section">
        <h2>成员（{team.members.length}）</h2>
        <div className="list">
          {team.members.map((m) => (
            <div key={m.userId} className="list-item">
              <div className="main">
                <span className="title">{m.user?.name || m.user?.email || m.userId}</span>
                <span className="sub">{m.user?.email}</span>
              </div>
              <span className={`chip ${m.role === 'owner' ? '' : 'muted'}`}>
                {m.role === 'owner' ? '拥有者' : '成员'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
