import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { getTeamDetail, toSkillDto } from '@/lib/teams/repo';
import { createSkillSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 团队 skill 清单(详情已含,这里独立暴露 GET 便于将来按需取)。
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const team = await getTeamDetail(id, user.id);
    if (!team) return Response.json({ error: '团队不存在或无权访问' }, { status: 404 });
    return Response.json({ skills: team.skills });
  } catch (e) {
    return errorResponse(e);
  }
}

// 添加 skill 条目(任何团队成员可加)。
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser();
    const { id } = await ctx.params;
    const team = await getTeamDetail(id, user.id);
    if (!team) return Response.json({ error: '团队不存在或无权访问' }, { status: 404 });

    const body = await req.json().catch(() => null);
    const parsed = createSkillSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '参数不合法' },
        { status: 400 },
      );
    }
    const { name, description, sourceType, sourceRef } = parsed.data;
    const skill = await prisma.teamSkill.create({
      data: {
        teamId: id,
        name,
        description: description?.trim() ? description.trim() : null,
        sourceType: sourceType === 'github' ? 'GITHUB' : 'SHARE',
        sourceRef,
        addedByUserId: user.id,
      },
      include: { adder: { select: { id: true, name: true } } },
    });
    return Response.json({ skill: toSkillDto(skill) }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
