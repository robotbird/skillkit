import { head, put, get, del, list, BlobNotFoundError } from '@vercel/blob';
import type { ShareMeta } from './types.js';
import type { ShareStore } from './store.js';

/**
 * Vercel Blob(public)实现 —— 用于 Vercel serverless。
 * 每个 share 存两个 blob:`<id>.json`(元数据)+ `<id>.zip`(压缩包)。
 * addRandomSuffix 保持 false(默认),pathname 恰为 `<id>.*`,便于 head/del。
 * 用 public 访问:分享内容本就通过短链公开分享,public store 即可,无需 private store。
 * 6 字符 ID 不可猜(32^6≈1e9),枚举仍需 BLOB_READ_WRITE_TOKEN。
 * 写/head/del/list 走环境变量 BLOB_READ_WRITE_TOKEN(或 Vercel OIDC),SDK 自动读取。
 */
export class BlobStore implements ShareStore {
  async has(id: string): Promise<boolean> {
    try {
      await head(`${id}.json`);
      return true;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return false;
      throw e;
    }
  }

  async writeShare(meta: ShareMeta, zip: Buffer): Promise<void> {
    await put(`${meta.id}.json`, JSON.stringify(meta, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
    await put(`${meta.id}.zip`, zip, {
      access: 'public',
      contentType: 'application/zip',
      addRandomSuffix: false,
    });
  }

  async readMeta(id: string): Promise<ShareMeta | null> {
    const r = await get(`${id}.json`);
    if (!r || r.statusCode !== 200) return null;
    const text = await new Response(r.stream).text();
    try {
      return JSON.parse(text) as ShareMeta;
    } catch {
      return null;
    }
  }

  async getZip(
    id: string,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
    const r = await get(`${id}.zip`);
    if (!r || r.statusCode !== 200) return null;
    return { stream: r.stream, size: r.blob.size };
  }

  async deleteShare(id: string): Promise<void> {
    // del 对不存在的 blob 不会抛错
    await del([`${id}.json`, `${id}.zip`]);
  }

  async sweepExpired(now: number = Date.now()): Promise<number> {
    let removed = 0;
    let res = await list({ limit: 1000 });
    for (;;) {
      for (const b of res.blobs) {
        const name = b.pathname.replace(/^\//, '');
        if (!name.endsWith('.json')) continue;
        const id = name.slice(0, -'.json'.length);
        const meta = await this.readMeta(id);
        if (!meta) continue;
        if (meta.expiresAt <= now) {
          await this.deleteShare(id);
          removed++;
        }
      }
      if (!res.hasMore) break;
      res = await list({ cursor: res.cursor, limit: 1000 });
    }
    return removed;
  }
}
