import { prisma } from '@/lib/db';
import { roleFromDb } from '@/lib/auth/guards';
import { uniqueSlug } from './slug';
import type { Team, TeamMember, TeamRole, TeamSkill } from '@skillkit/types';

// Prisma 行(枚举大写、DateTime)→ types DTO(小写 union、epoch ms)的映射 + 团队查询。
// getTeamDetail 内置成员校验:非成员一律返回 null(页面/API 统一表现为「不存在」)。

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: Date;
};

export function toTeamDto(t: TeamRow): Team {
  return { id: t.id, name: t.name, slug: t.slug, ownerId: t.ownerId, createdAt: t.createdAt.getTime() };
}

export function toMemberDto(m: {
  userId: string;
  teamId: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: Date;
  user?: { id: string; name: string | null; email: string } | null;
}): TeamMember {
  return {
    userId: m.userId,
    teamId: m.teamId,
    role: roleFromDb(m.role),
    joinedAt: m.joinedAt.getTime(),
    user: m.user ? { id: m.user.id, name: m.user.name, email: m.user.email } : undefined,
  };
}

export function toSkillDto(s: {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  sourceType: 'GITHUB' | 'SHARE';
  sourceRef: string;
  addedByUserId: string | null;
  addedAt: Date;
  adder?: { id: string; name: string | null } | null;
}): TeamSkill {
  return {
    id: s.id,
    teamId: s.teamId,
    name: s.name,
    description: s.description,
    sourceType: s.sourceType === 'GITHUB' ? 'github' : 'share',
    sourceRef: s.sourceRef,
    addedByUserId: s.addedByUserId ?? '',
    addedAt: s.addedAt.getTime(),
    addedBy: s.adder ? { id: s.adder.id, name: s.adder.name } : undefined,
  };
}

/** 当前用户所在的团队列表(含角色、成员数、skill 数)。 */
export async function listMyTeams(userId: string) {
  const rows = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          createdAt: true,
          _count: { select: { members: true, skills: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });
  return rows.map((r) => ({
    ...toTeamDto(r.team),
    role: roleFromDb(r.role),
    memberCount: r.team._count.members,
    skillCount: r.team._count.skills,
  }));
}

/** 团队详情(含成员、skill 清单)。非成员返回 null。 */
export async function getTeamDetail(
  teamId: string,
  userId: string,
): Promise<(Team & { role: TeamRole; members: TeamMember[]; skills: TeamSkill[] }) | null> {
  const me = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!me) return null;
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { joinedAt: 'asc' },
      },
      skills: {
        include: { adder: { select: { id: true, name: true } } },
        orderBy: { addedAt: 'desc' },
      },
    },
  });
  if (!team) return null;
  return {
    ...toTeamDto(team),
    role: roleFromDb(me.role),
    members: team.members.map(toMemberDto),
    skills: team.skills.map(toSkillDto),
  };
}

export async function createTeam(name: string, ownerId: string): Promise<Team> {
  const slug = await uniqueSlug(name);
  // 事务:建团队 + 把 owner 登记为 OWNER 成员。
  const team = await prisma.$transaction(async (tx) => {
    const t = await tx.team.create({ data: { name, slug, ownerId } });
    await tx.teamMember.create({ data: { teamId: t.id, userId: ownerId, role: 'OWNER' } });
    return t;
  });
  return toTeamDto(team);
}

export async function deleteTeam(teamId: string): Promise<void> {
  await prisma.team.delete({ where: { id: teamId } });
}
