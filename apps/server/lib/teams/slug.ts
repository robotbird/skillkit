import { customAlphabet } from 'nanoid';
import { prisma } from '@/lib/db';

// 4 位随机后缀字符表(小写字母+数字),用于保证 slug 唯一。
const suffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 4);

/** 把任意名称转成 url-safe slug(仅保留 ascii 小写字母/数字,其余转 -)。
 *  非 ascii(如中文)会被整体丢弃 → 留空时用 'team' 兜底。展示仍用原始 name。 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'team';
}

/** 生成团队唯一 slug(碰撞重试,思路参考 lib/id.ts 的 newShareId)。 */
export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 24);
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${suffix()}`;
    const exists = await prisma.team.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  // 极小概率仍碰撞:再追加一段。
  return `${base}-${suffix()}${suffix()}`;
}
