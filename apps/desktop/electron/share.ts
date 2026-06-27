import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';
import { listInstalled, getShareLink, upsertShareLink, type ShareLinkRow } from './db.js';
import { installFromZip } from './installer.js';
import {
  SHARE_BASE_URL,
  SHARE_MAX_BYTES,
  type InstallResult,
  type InstalledSkill,
  type ShareCreateResult,
  type ShareMeta,
  type ShareSourceInfo,
  type Tool,
} from '../shared/types.js';

/**
 * 同一 (tool, name) 的 skill 是否与缓存时内容一致：mtime + 体积都对得上才算未变。
 * 任一边缺指纹（扫描时 stat 失败等）则无法判定，保守视为「未变」以命中缓存。
 */
function shareContentUnchanged(cached: ShareLinkRow, skill: InstalledSkill): boolean {
  if (cached.mtime == null || cached.sizeBytes == null) return true;
  if (skill.mtime == null || skill.sizeBytes == null) return true;
  return cached.mtime === skill.mtime && cached.sizeBytes === skill.sizeBytes;
}

/**
 * 把一个本地已安装的 skill 打包并上传到分享服务，返回短链。
 *
 * 同一 skill 在链接未过期且内容未变时会复用数据库里缓存的短链，不再重复打包上传；
 * skill 被改动（mtime/体积变化）或旧链接过期后会自动重新生成。
 */
export async function shareSkill(tool: Tool, name: string): Promise<ShareCreateResult> {
  const list = listInstalled({ tool });
  const skill = list.find((s) => s.name === name);
  if (!skill) throw new Error(`未找到 ${name}（${tool}）`);

  const now = Date.now();

  // 命中缓存：同一 (tool, name) 已有未过期且内容未变的分享，直接复用
  const cached = getShareLink(tool, name);
  if (cached && cached.expiresAt > now && shareContentUnchanged(cached, skill)) {
    return { id: cached.shareId, url: cached.url, expiresAt: cached.expiresAt };
  }

  // 打包
  const zip = new AdmZip();
  zip.addLocalFolder(skill.path);
  const buf = zip.toBuffer();
  if (buf.length > SHARE_MAX_BYTES) {
    throw new Error(
      `skill 体积 ${(buf.length / 1024 / 1024).toFixed(1)}MB，超过 ${(SHARE_MAX_BYTES / 1024 / 1024).toFixed(0)}MB 上限`,
    );
  }

  const form = new FormData();
  form.append('name', skill.name);
  form.append('description', skill.description ?? '');
  form.append('sourceTool', skill.tool);
  form.append('file', new Blob([buf], { type: 'application/zip' }), `${skill.name}.zip`);

  let res: Response;
  try {
    res = await fetch(`${SHARE_BASE_URL}/share`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60000),
    });
  } catch (e: any) {
    throw new Error(
      `无法连接到分享服务（${SHARE_BASE_URL}）：${e?.message ?? e}。请确认 server 已启动（npm run server）`,
    );
  }
  if (!res.ok) {
    // 只读一次 body:res.json() 失败后再 res.text() 会因 body 已被消耗而抛
    // "Body has already been read",把真实的服务端错误盖掉。
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      detail = '<响应体不可读>';
    }
    throw new Error(`分享失败（HTTP ${res.status}）：${detail}`);
  }
  const data = (await res.json()) as ShareCreateResult;
  // 链接以客户端使用的基地址为准（不依赖服务端/反代的 Host 头）
  const url = `${SHARE_BASE_URL}/share/${data.id}`;
  // 缓存这条分享，下次同一 skill 直接复用
  upsertShareLink({
    tool,
    name,
    shareId: data.id,
    url,
    expiresAt: data.expiresAt,
    createdAt: now,
    mtime: skill.mtime,
    sizeBytes: skill.sizeBytes,
  });
  return { ...data, url };
}

/**
 * 接受 url / `host/share/<id>` / 裸 id，返回短链 id。
 */
export function parseShareId(input: string): string {
  const s = input.trim();
  const m = s.match(/share\/([A-Za-z0-9]{4,12})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9]{4,12}$/.test(s)) return s;
  throw new Error('无法解析分享链接 / 短链 ID');
}

/**
 * 仅查询分享元数据（用于 UI 在安装前展示 skill 名称等）。
 */
export async function inspectShare(input: string): Promise<ShareSourceInfo> {
  const id = parseShareId(input);
  let res: Response;
  try {
    res = await fetch(`${SHARE_BASE_URL}/share/${id}/meta`, {
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    throw new Error(
      `无法连接到分享服务（${SHARE_BASE_URL}）：${e?.message ?? e}`,
    );
  }
  if (res.status === 404) throw new Error('链接不存在或已被清理');
  if (res.status === 410) {
    return {
      meta: { id } as ShareMeta, // 占位
      exists: false,
    };
  }
  if (!res.ok) throw new Error(`查询分享失败（HTTP ${res.status}）`);
  const meta = (await res.json()) as ShareMeta;
  return { meta, exists: true };
}

/**
 * 拉取分享 zip 并安装到目标工具，复用现有 installFromZip。
 */
export async function installFromShare(
  input: string,
  targets: Tool[],
): Promise<InstallResult[]> {
  const id = parseShareId(input);

  let res: Response;
  try {
    res = await fetch(`${SHARE_BASE_URL}/share/${id}/zip`, {
      signal: AbortSignal.timeout(60000),
    });
  } catch (e: any) {
    return targets.map((t) => ({
      tool: t,
      ok: false,
      error: `无法连接到分享服务（${SHARE_BASE_URL}）：${e?.message ?? e}`,
    }));
  }
  if (res.status === 410)
    return targets.map((t) => ({ tool: t, ok: false, error: '链接已过期' }));
  if (res.status === 404)
    return targets.map((t) => ({ tool: t, ok: false, error: '链接不存在或已清理' }));
  if (!res.ok || !res.body)
    return targets.map((t) => ({ tool: t, ok: false, error: `下载失败（HTTP ${res.status}）` }));

  // 写到临时文件再交给 installFromZip
  const tmpZip = path.join(os.tmpdir(), `skillkit-share-${id}.zip`);
  try {
    await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(tmpZip));
    return await installFromZip(tmpZip, targets);
  } catch (e: any) {
    return targets.map((t) => ({ tool: t, ok: false, error: e?.message ?? String(e) }));
  } finally {
    try {
      fs.rmSync(tmpZip, { force: true });
    } catch {
      /* ignore */
    }
  }
}
