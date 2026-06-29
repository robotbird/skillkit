import { getCurrentUser } from './session';
import { prisma } from '@/lib/db';
import type { PublicUser, TeamRole, TeamMember as TeamMemberRow } from '@skillkit/types';

// Prisma 枚举(大写)↔ types union(小写)映射。
export function roleFromDb(r: 'OWNER' | 'MEMBER'): TeamRole {
  return r === 'OWNER' ? 'owner' : 'member';
}

/** 要求已登录,否则抛 Unauthorized(供 route handler 顶部调用)。 */
export async function requireUser(): Promise<{ user: PublicUser; v: number }> {
  const cur = await getCurrentUser();
  if (!cur) throw new Unauthorized();
  return cur;
}

/** 要求是某团队成员(可选最低角色);否则抛 Forbidden。返回成员记录 + 角色。 */
export async function requireTeamMember(
  teamId: string,
  userId: string,
  minRole?: TeamRole,
): Promise<{ membership: TeamMemberRow; role: TeamRole }> {
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!m) throw new Forbidden();
  const role = roleFromDb(m.role);
  if (minRole === 'owner' && role !== 'owner') throw new Forbidden();
  return { membership: { userId: m.userId, teamId: m.teamId, role, joinedAt: m.joinedAt.getTime() }, role };
}

// 简易 HTTP 错误:route handler catch 后由 errorResponse() 转成 JSON 响应。
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export class Unauthorized extends HttpError {
  constructor() {
    super(401, '未登录或会话已过期');
  }
}
export class Forbidden extends HttpError {
  constructor() {
    super(403, '无权访问');
  }
}

/** 在 route handler 里把 HttpError / 未知错误统一转成 Response。 */
export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  console.error('[api] unexpected error:', e);
  return Response.json({ error: '服务器错误' }, { status: 500 });
}
