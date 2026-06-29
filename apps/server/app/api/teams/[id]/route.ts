import type { NextRequest } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { getTeamDetail, deleteTeam } from '@/lib/teams/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 团队详情(含成员 + skill 清单)。getTeamDetail 内置成员校验,非成员 → 404。
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const team = await getTeamDetail(id, user.id);
    if (!team) return Response.json({ error: '团队不存在或无权访问' }, { status: 404 });
    return Response.json({ team });
  } catch (e) {
    return errorResponse(e);
  }
}

// 删除团队(仅 owner)。
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const team = await getTeamDetail(id, user.id);
    if (!team) return Response.json({ error: '团队不存在或无权访问' }, { status: 404 });
    if (team.role !== 'owner') {
      return Response.json({ error: '仅拥有者可删除团队' }, { status: 403 });
    }
    await deleteTeam(id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
