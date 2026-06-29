import type { NextRequest } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth/guards';
import { listMyTeams, createTeam } from '@/lib/teams/repo';
import { createTeamSchema } from '@/lib/validation';
import type { CreateTeamResponse } from '@skillkit/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 我所在的团队列表。
export async function GET() {
  try {
    const { user } = await requireUser();
    const teams = await listMyTeams(user.id);
    return Response.json({ teams });
  } catch (e) {
    return errorResponse(e);
  }
}

// 创建团队(同时把创建者登记为 OWNER)。
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser();
    const body = await req.json().catch(() => null);
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? '参数不合法' },
        { status: 400 },
      );
    }
    const team = await createTeam(parsed.data.name, user.id);
    const res: CreateTeamResponse = { team };
    return Response.json(res, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
