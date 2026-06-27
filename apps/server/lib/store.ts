import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { ShareMeta } from '@skillkit/types';

// 本地存储目录:优先读 SHARE_LOCAL_DIR env,默认 <cwd>/data。
// (仅 SHARE_STORE=local 即本地开发使用;Vercel 生产走 BlobStore 不碰这里。)
const DATA_DIR = process.env.SHARE_LOCAL_DIR
  ? path.resolve(process.env.SHARE_LOCAL_DIR)
  : path.resolve(process.cwd(), 'data');

/**
 * 存储抽象 —— 两种实现共享同一接口:
 *  - LocalStore:本地文件系统(本地开发,data/)
 *  - BlobStore:Vercel Blob(public,见 store-blob.ts)
 * 由 getStore() 按 SHARE_STORE 环境变量选择。
 */
export interface ShareStore {
  has(id: string): Promise<boolean>;
  writeShare(meta: ShareMeta, zip: Buffer): Promise<void>;
  readMeta(id: string): Promise<ShareMeta | null>;
  /** 下载流 + 字节数;不存在返回 null(交给路由返回 404)。 */
  getZip(id: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  deleteShare(id: string): Promise<void>;
  /** 清理已过期项,返回删除数量。仅用于省存储,正确性不依赖它(读时已校验过期)。 */
  sweepExpired(): Promise<number>;
}

function metaPath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}
function zipPath(id: string) {
  return path.join(DATA_DIR, `${id}.zip`);
}

/** node ReadStream → web ReadableStream(Response 可直接消费)。 */
function nodeStreamToWeb(stream: fsSync.ReadStream): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) =>
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : (chunk as Uint8Array)),
      );
      stream.on('end', () => controller.close());
      stream.on('error', (e) => controller.error(e));
    },
    cancel() {
      stream.destroy();
    },
  });
}

/** 本地文件系统实现(本地开发)。 */
export class LocalStore implements ShareStore {
  constructor() {
    fsSync.mkdirSync(DATA_DIR, { recursive: true });
  }

  async has(id: string): Promise<boolean> {
    return fsSync.existsSync(metaPath(id)) && fsSync.existsSync(zipPath(id));
  }

  async writeShare(meta: ShareMeta, zip: Buffer): Promise<void> {
    await fs.writeFile(zipPath(meta.id), zip as Uint8Array);
    await fs.writeFile(metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf8');
  }

  async readMeta(id: string): Promise<ShareMeta | null> {
    try {
      const raw = await fs.readFile(metaPath(id), 'utf8');
      return JSON.parse(raw) as ShareMeta;
    } catch {
      return null;
    }
  }

  async getZip(id: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
    const p = zipPath(id);
    if (!fsSync.existsSync(p)) return null;
    const size = fsSync.statSync(p).size;
    return { stream: nodeStreamToWeb(fsSync.createReadStream(p)), size };
  }

  async deleteShare(id: string): Promise<void> {
    await Promise.all([fs.rm(metaPath(id), { force: true }), fs.rm(zipPath(id), { force: true })]);
  }

  async sweepExpired(now: number = Date.now()): Promise<number> {
    let entries: string[];
    try {
      entries = await fs.readdir(DATA_DIR);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const f of entries) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      const meta = await this.readMeta(id);
      if (!meta) continue;
      if (meta.expiresAt <= now) {
        await this.deleteShare(id);
        removed++;
      }
    }
    return removed;
  }
}

let _store: Promise<ShareStore> | null = null;

/**
 * 按环境返回(并缓存)存储实现。
 * 用动态 import 加载 BlobStore,这样 SHARE_STORE=local 时根本不会引入 @vercel/blob ——
 * 本地开发无需配置该包与 token。
 */
export function getStore(): Promise<ShareStore> {
  if (_store) return _store;
  _store = (async () => {
    if (process.env.SHARE_STORE === 'blob') {
      const { BlobStore } = await import('./store-blob');
      return new BlobStore();
    }
    return new LocalStore();
  })();
  return _store;
}
