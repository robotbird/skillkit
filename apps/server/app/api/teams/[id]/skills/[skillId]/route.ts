import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { toSkillDto } from '@/lib/teams/repo';
import { updateSkillSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 校验:当前用户是团队成员,且 skill 属于该团队。否则统一 404(不泄露存在)。
async function guardSkill(teamId: string, skillId: string, userId: string) {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) return { status: 404 } as const;
  const skill = await prisma.teamSkill.findUnique({ where: { id: skillId } });
  if (!skill || skill.teamId !== teamId) return { status: 404 } as const;
  return { member, skill } as const;
}

// 移除 skill 条目(任何团队成员可移除)。
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; skillId: string }> }) {
  try {
    const { user } = await requireUser();
    const { id, skillId } = await ctx.params;
    const g = await guardSkill(id, skillId, user.id);
    if ('status' in g) return Response.json({ error: '不存在或无权访问' }, { status: g.status });
    await prisma.teamSkill.delete({ where: { id: skillId } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// 改名 / 改描述。
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; skillId: string }> }) {
  try {
    const { user } = await requireUser();
    const { id, skillId } = await ctx.params;
    const g = await guardSkill(id, skillId, user.id);
    if ('status' in g) return Response.json({ error: '不存在或无权访问' }, { status: g.status });

    const body = await req.json().catch(() => null);
    const parsed = updateSkillSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '参数不合法' },
        { status: 400 },
      );
    }
    const { name, description } = parsed.data;
    const updated = await prisma.teamSkill.update({
      where: { id: skillId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined
          ? { description: description == null ? null : description.trim() || null }
          : {}),
      },
      include: { adder: { select: { id: true, name: true } } },
    });
    return Response.json({ skill: toSkillDto(updated) });
  } catch (e) {
    return errorResponse(e);
  }
}
