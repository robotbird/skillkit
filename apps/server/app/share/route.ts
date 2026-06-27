import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/store';
import { newShareId } from '@/lib/id';
import {
  SHARE_TTL_MS,
  SHARE_MAX_BYTES,
  type ShareMeta,
  type ShareCreateResult,
  type Tool,
} from '@skillkit/types';

const VALID_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae', 'workbuddy'];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 上传创建分享。desktop (electron/share.ts) 以 multipart/form-data POST 到 /share,
// 字段:name / description / sourceTool / file(zip)。公开路径不带 /api 前缀,与旧契约一致。
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: '请求体不是 multipart/form-data' }, { status: 400 });
  }

  const name = (form.get('name') ?? '').toString().trim();
  const description = ((form.get('description') ?? '') as string).trim() || null;
  const sourceTool = (form.get('sourceTool') ?? '').toString().trim() as Tool;
  const file = form.get('file');

  if (!name) return Response.json({ error: 'name 必填' }, { status: 400 });
  if (!VALID_TOOLS.includes(sourceTool)) return Response.json({ error: 'sourceTool 不合法' }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: '缺少 file 字段或不是文件' }, { status: 400 });
  if (file.size > SHARE_MAX_BYTES)
    return Response.json({ error: `文件超过 ${(SHARE_MAX_BYTES / 1024 / 1024).toFixed(0)}MB 上限` }, { status: 413 });
  if (file.size <= 0) return Response.json({ error: '文件为空' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const store = await getStore();

  // 生成 id(碰撞重试 3 次)
  let id = '';
  for (let i = 0; i < 3; i++) {
    const candidate = newShareId();
    if (!(await store.has(candidate))) {
      id = candidate;
      break;
    }
  }
  if (!id) return Response.json({ error: '生成 id 失败,请重试' }, { status: 503 });

  const now = Date.now();
  const meta: ShareMeta = {
    id,
    name,
    description,
    sourceTool,
    sizeBytes: buf.length,
    createdAt: now,
    expiresAt: now + SHARE_TTL_MS,
  };
  await store.writeShare(meta, buf);

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'skillkit.net';
  const url = `${proto}://${host}/share/${id}`;
  const result: ShareCreateResult = { id, url, expiresAt: meta.expiresAt };
  return Response.json(result, { status: 201 });
}
