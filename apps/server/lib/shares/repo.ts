import { prisma } from '@/lib/db';
import { getStore } from '@/lib/store';
import type { MyShare, ShareMeta, Tool } from '@skillkit/types';

/**
 * 分享归因仓库:在 Postgres 记录「谁分享了什么」(zip 字节仍在 ShareStore)。
 * - 列表 / 删除按 userId 过滤;删除时同时删 Prisma 行 + store 的 blob。
 * - DateTime <-> epoch ms 在此层映射(与 lib/teams 风格一致,但 teams 已移除)。
 */

function rowToMyShare(s: {
  id: string;
  name: string;
  sourceTool: string;
  sizeBytes: number;
  createdAt: Date;
  expiresAt: Date;
}, origin: string): MyShare {
  return {
    id: s.id,
    name: s.name,
    sourceTool: s.sourceTool as Tool,
    sizeBytes: s.sizeBytes,
    createdAt: s.createdAt.getTime(),
    expiresAt: s.expiresAt.getTime(),
    url: `${origin}/share/${s.id}`,
  };
}

/** 列出某用户的全部分享,按创建时间倒序。origin 用于拼完整短链。 */
export async function listMyShares(userId: string, origin: string): Promise<MyShare[]> {
  const rows = await prisma.share.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((s) => rowToMyShare(s, origin));
}

/** /share 创建成功后落库归属记录。meta.id 即 store 写入的 id。失败仅抛错,由调用方记 log(不阻断分享)。 */
export async function createShareRecord(userId: string, meta: ShareMeta): Promise<void> {
  await prisma.share.create({
    data: {
      id: meta.id,
      userId,
      name: meta.name,
      sourceTool: meta.sourceTool,
      sizeBytes: meta.sizeBytes,
      createdAt: new Date(meta.createdAt),
      expiresAt: new Date(meta.expiresAt),
    },
  });
}

/** 删除一条分享:先验归属(非属主/不存在返回 false),再删 Prisma 行 + store blob。
 *  blob 删除失败不回滚(Prisma 行已删;blob 留待 sweep 按 expiresAt 过期清理)。 */
export async function deleteMyShare(id: string, userId: string): Promise<boolean> {
  const row = await prisma.share.findUnique({ where: { id }, select: { userId: true } });
  if (!row || row.userId !== userId) return false;
  await prisma.share.delete({ where: { id } });
  try {
    const store = await getStore();
    await store.deleteShare(id);
  } catch (e) {
    // blob 删除失败不致命:记录已删,残留 blob 由 sweep 清理。
    console.error('[shares] delete blob failed for', id, e);
  }
  return true;
}
