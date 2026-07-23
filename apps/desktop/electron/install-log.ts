import path from 'node:path';
import type {
  InstallResult,
  RepoBatchResult,
  InstallRecordChannel,
  InstallRecordStatus,
  InstallRecordTarget,
  InstallErrorType,
} from '../shared/types.js';

/**
 * 安装记录的构造与报错分类。主进程 IPC 层在每次安装后用 {@link buildInstallRecord}
 * 把 InstallResult[] / RepoBatchResult[] 归一成一行记录，再交给 db.insertInstallRecord 落库。
 * 这里只做纯数据塑形，不碰 DB / 副作用。
 */

/** 报错分类优先级（数字越大越"严重"），用于从多个失败工具里 reduce 出整条记录的 errorType。 */
const ERROR_TYPE_RANK: Record<InstallErrorType, number> = {
  network: 3,
  filesystem: 2,
  not_found: 1,
  unknown: 0,
};

/**
 * 用报错文案启发式分类。installer 把网络超时、路径错误、SKILL.md 缺失等都吞成
 * {ok:false,error} 的中文消息返回，这里据子串判定类型（仅用于展示徽标，不影响落库）。
 */
export function classifyInstallError(msg: string | undefined | null): InstallErrorType {
  const s = (msg ?? '').toLowerCase();
  if (!s) return 'unknown';
  if (/网络|超时|timeout|timed out|abort|econnreset|etimedout|enetunreach|enotfound|fetch|socket|ssl|tls|cert/.test(s))
    return 'network';
  if (/eacces|eperm|enospc|权限|空间不足|symlink|read-only|只读|enoent|ebusy/.test(s)) return 'filesystem';
  if (/找不到|不存在|未发现|缺失|解析失败|非法|无效|未找到|no such/.test(s)) return 'not_found';
  return 'unknown';
}

/** 从一组失败报错里 reduce 出最严重的类型；无失败返回 null。 */
export function deriveErrorType(targets: InstallRecordTarget[]): InstallErrorType | null {
  const failed = targets.filter((t) => !t.ok);
  if (failed.length === 0) return null;
  return failed
    .map((t) => classifyInstallError(t.error))
    .reduce<InstallErrorType>((acc, cur) => (ERROR_TYPE_RANK[cur] > ERROR_TYPE_RANK[acc] ? cur : acc), 'unknown');
}

/**
 * 整条记录的 errorType：优先从失败工具 reduce；没有失败工具时（扫描阶段失败，
 * targets 为空）则按整体 error 文案分类；都没有返回 null。
 */
export function deriveRecordErrorType(
  targets: InstallRecordTarget[],
  error: string | null,
): InstallErrorType | null {
  const fromTargets = deriveErrorType(targets);
  if (fromTargets) return fromTargets;
  return error ? classifyInstallError(error) : null;
}

/** 待落库的一条安装记录（不含 id / at —— 由 db 层补）。 */
export interface InstallRecordInput {
  channel: InstallRecordChannel;
  label: string;
  skillName: string | null;
  status: InstallRecordStatus;
  error: string | null; // 失败摘要；扫描阶段失败的报错也放这里
  targets: InstallRecordTarget[];
}

function isBatch(r: readonly unknown[]): r is RepoBatchResult[] {
  return r.length > 0 && Array.isArray((r[0] as RepoBatchResult)?.results);
}

/**
 * 把安装结果归一为一条记录输入。同时接受单批 {@link InstallResult[]} 与多 skill
 * {@link RepoBatchResult[]}（批量安装）。无任何目标被处理时返回 null（不落库）。
 */
export function buildInstallRecord(
  channel: InstallRecordChannel,
  label: string,
  results: InstallResult[] | RepoBatchResult[],
): InstallRecordInput | null {
  if (!Array.isArray(results) || results.length === 0) return null;

  let targets: InstallRecordTarget[];
  let skillName: string | null;

  if (isBatch(results as readonly unknown[])) {
    const batch = results as RepoBatchResult[];
    targets = batch.flatMap((b) =>
      b.results.map((r) => ({ tool: r.tool, ok: r.ok, path: r.path, error: r.error })),
    );
    const okNames = batch.filter((b) => b.results.some((r) => r.ok)).map((b) => b.skillName);
    skillName = okNames.length ? okNames.join(', ') : null;
  } else {
    const list = results as InstallResult[];
    targets = list.map((r) => ({ tool: r.tool, ok: r.ok, path: r.path, error: r.error }));
    const firstOkPath = list.find((r) => r.ok && r.path)?.path;
    skillName = firstOkPath ? path.basename(firstOkPath) : null;
  }

  if (targets.length === 0) return null;
  const okCount = targets.filter((t) => t.ok).length;
  const status: InstallRecordStatus =
    okCount === targets.length ? 'success' : okCount === 0 ? 'failed' : 'partial';
  // 失败摘要：去重后的各工具报错（截断），供列表/弹窗快速展示；成功为 null。
  const error =
    status === 'success'
      ? null
      : [...new Set(targets.filter((t) => !t.ok).map((t) => t.error).filter(Boolean))]
          .join('; ')
          .slice(0, 500) || null;

  return { channel, label, skillName, status, error, targets };
}

/**
 * 构造一条「扫描阶段失败」记录：用户发起了安装，但在列举/识别 skill 阶段就失败
 * （地址解析失败、网络/限流、整包兜底后仍 0 候选）。无 per-tool 明细，报错进 error。
 */
export function buildScanFailureRecord(
  channel: InstallRecordChannel,
  label: string,
  error: string,
): InstallRecordInput {
  return { channel, label, skillName: null, status: 'failed', error, targets: [] };
}
