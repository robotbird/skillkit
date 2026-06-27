import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { metaGet, metaSet } from './db.js';

/** meta KV 中存仓库根目录的键 */
const META_KEY = 'warehouse_root';

/**
 * 默认仓库根目录：`~/GitHub`。
 * 仅作未配置时的展示兜底，不要求该目录真实存在。
 */
export const DEFAULT_WAREHOUSE_ROOT = path.join(os.homedir(), 'GitHub');

/**
 * 读取仓库根目录。未配置时返回默认值 `~/GitHub`（不校验存在性）。
 */
export function getWarehouseRoot(): string {
  return metaGet(META_KEY) || DEFAULT_WAREHOUSE_ROOT;
}

/**
 * 设置仓库根目录：校验为已存在的目录后持久化，返回持久化后的（绝对）路径。
 *
 * 目录选择器只会返回已存在的目录，这里的校验是防御性的——
 * 后续若有「输入路径」入口，这里的报错能给清晰提示。
 */
export function setWarehouseRoot(p: string): string {
  const dir = path.resolve(p.trim());
  let st: fs.Stats;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error(`目录不存在：${dir}`);
  }
  if (!st.isDirectory()) throw new Error(`所选路径不是目录：${dir}`);
  metaSet(META_KEY, dir);
  return dir;
}
