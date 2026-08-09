// skill 更新检测（desktop 主进程）。
// 思路参考 skills-manager/docs/skill-update-detection.md，降级为 JS/Electron 版：
//   轻量探测（GitHub API 拿 tip SHA，不 clone）+ 懒基准比对 + TTL 防抖 + 检测与应用解耦。
// 检测状态持久化于独立表 skill_update_state（不被 scanAll 清空），键 (tool, name)。
// 「应用更新」= 用原 source 重跑 installFromGithub/installFromMarket，复用安装的备份+回滚。
import { BrowserWindow } from 'electron';
import {
  parseGithubRef,
  installFromGithub,
  installFromMarket,
  ghApiJson,
  defaultBranch,
  GH_API,
} from './installer.js';
import {
  listInstalled,
  upsertSkillUpdateState,
  getSkillUpdateState,
  getSkillUpdateStateMap,
  metaGet,
  metaSet,
} from './db.js';
import { customKindOf } from './tools.js';
import { SETTING_KEYS } from '../shared/types.js';
import type {
  Tool,
  InstallResult,
  SkillUpdateState,
  SkillUpdateSummary,
  SkillUpdateStatus,
  SkillUpdateInterval,
} from '../shared/types.js';

const UPDATE_TTL_MS = 60 * 60 * 1000; // 同一 skill 60min 内不重复探测（手动 force 绕过）
const STARTUP_DELAY_MS = 60_000; // 启动后约 1 分钟首检（满足「每天打开后 1 分钟检测一遍」）
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 每 15min 唤醒重判是否到期（镜像参考方案的 POLL_INTERVAL）
const DEFAULT_INTERVAL: SkillUpdateInterval = '8h';

/** 解析后的可检测远端源（仅 github/market；zip/copy/builtin/null 返回 null 跳过）。 */
interface ParsedSource {
  kind: 'github' | 'market';
  owner: string;
  repo: string;
  branch?: string; // github 源可能带 branch；字面量 'HEAD' 表示用默认分支
  subpath?: string;
}

/**
 * 把 installed_skills.source 解析成可检测的远端源。
 * - `github:<canonicalUrl>` → 复用 parseGithubRef 解出 owner/repo/branch/subpath。
 * - `market:owner/repo/name` → owner/repo + subpath=name（市场源本质也是 GitHub 仓库）。
 * - 其它（zip / copy:非github / builtin / null）→ null，无远端可检测。
 */
export function parseUpdateSource(source: string | null | undefined): ParsedSource | null {
  if (!source) return null;
  if (source.startsWith('github:')) {
    const url = source.slice('github:'.length).trim();
    const ref = parseGithubRef(url);
    if (!ref) return null;
    return { kind: 'github', owner: ref.owner, repo: ref.repo, branch: ref.branch, subpath: ref.subpath };
  }
  if (source.startsWith('market:')) {
    const slug = source.slice('market:'.length).trim();
    const parts = slug.split('/');
    if (parts.length < 3) return null;
    const [owner, repo, ...rest] = parts;
    return { kind: 'market', owner, repo: repo.replace(/\.git$/, ''), subpath: rest.join('/') };
  }
  return null;
}

/** 探测远端某 ref 的最新 commit SHA（git ls-remote 的等价物，不 clone）。
 *  branch 为 undefined 或字面量 'HEAD' 时解析默认分支。任何失败返回 null（不抛）。 */
async function fetchRemoteRevision(owner: string, repo: string, branch?: string): Promise<string | null> {
  try {
    const ref = !branch || branch === 'HEAD' ? await defaultBranch(owner, repo) : branch;
    const data = await ghApiJson<{ sha: string }>(
      `${GH_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
    );
    return data?.sha ?? null;
  } catch {
    return null;
  }
}

/** 重组 GitHub web URL 给 installFromGithub 用。无 subpath → 仓库根；有 subpath → /tree/<branch>/<subpath>。
 *  branch 缺省/为 'HEAD' 时解析默认分支（让安装走在线逐文件快路径，而非整包 tarball 兜底）。 */
async function githubWebUrl(parsed: ParsedSource): Promise<string> {
  const base = `https://github.com/${parsed.owner}/${parsed.repo}`;
  if (!parsed.subpath) return base;
  let branch = parsed.branch;
  if (!branch || branch === 'HEAD') {
    try {
      branch = await defaultBranch(parsed.owner, parsed.repo);
    } catch {
      branch = 'HEAD'; // 解析失败也无所谓：installFromGithub 会回退整包 tarball（codeload 接受 HEAD）
    }
  }
  return `${base}/tree/${branch}/${parsed.subpath}`;
}

function isStable(status: SkillUpdateStatus): boolean {
  return status === 'up_to_date' || status === 'update_available';
}

/** 基于当前全量状态算一个汇总（available/failed 取全量，保证徽章计数稳定）。 */
function summarizeCurrent(triggeredBy: 'auto' | 'manual'): SkillUpdateSummary {
  let available = 0;
  let failed = 0;
  for (const st of getSkillUpdateStateMap().values()) {
    if (st.updateStatus === 'update_available') available++;
    else if (st.updateStatus === 'error') failed++;
  }
  return { checked: 0, available, failed, updatedAt: Date.now(), triggeredBy };
}

/** 推送「一轮检测完成」事件给所有窗口（镜像 theme.ts 的全窗口广播模式）。 */
function broadcastSkillUpdateChecked(summary: SkillUpdateSummary): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('skill-update:checked', summary);
  }
}

let isRunning = false;

/**
 * 检查所有已装 skill 的更新。手动按钮传 force=true（绕过 TTL）；调度传 false。
 * 按仓库+分支去重，每个 ref 只探测一次。无基准的 skill 首次探测时懒记录基准并标 up_to_date。
 */
export async function checkSkillUpdatesInternal(
  force: boolean,
  triggeredBy: 'auto' | 'manual' = 'manual',
): Promise<SkillUpdateSummary> {
  // 已在跑：不重复，返回当前全量汇总（手动+调度重叠时直接复用）
  if (isRunning) return summarizeCurrent(triggeredBy);
  isRunning = true;
  try {
    const now = Date.now();
    const all = listInstalled();
    const stateMap = getSkillUpdateStateMap();

    // 1) 解析源 + TTL 防抖 → 本轮待检测清单
    interface Plan {
      tool: Tool;
      name: string;
      parsed: ParsedSource;
    }
    const plan: Plan[] = [];
    for (const s of all) {
      const parsed = parseUpdateSource(s.source);
      if (!parsed) continue;
      const st = stateMap.get(`${s.tool}|${s.name}`);
      if (
        !force &&
        st &&
        isStable(st.updateStatus) &&
        st.lastCheckedAt &&
        now - st.lastCheckedAt < UPDATE_TTL_MS
      ) {
        continue; // 稳定状态且在 TTL 内 → 跳过（出错/未知的不受保护，每次都查）
      }
      plan.push({ tool: s.tool, name: s.name, parsed });
    }

    // 2) 按 owner/repo@branch 去重，每 ref 一次探测
    interface Group {
      owner: string;
      repo: string;
      branch?: string;
      skills: Plan[];
    }
    const groups = new Map<string, Group>();
    for (const p of plan) {
      const k = `${p.parsed.owner}/${p.parsed.repo}@${p.parsed.branch ?? 'HEAD'}`;
      let g = groups.get(k);
      if (!g) {
        g = { owner: p.parsed.owner, repo: p.parsed.repo, branch: p.parsed.branch, skills: [] };
        groups.set(k, g);
      }
      g.skills.push(p);
    }

    let checked = 0;
    for (const g of groups.values()) {
      const remote = await fetchRemoteRevision(g.owner, g.repo, g.branch);
      checked += g.skills.length;
      const sourceKey = `${g.owner}/${g.repo}@${g.branch ?? 'HEAD'}`;
      for (const p of g.skills) {
        const prev = getSkillUpdateState(p.tool, p.name);
        const baseSha = prev?.sourceRevision ?? null;
        let status: SkillUpdateStatus;
        let error: string | null = null;
        let newBase = baseSha;
        if (remote === null) {
          status = 'error';
          error = '无法获取远端版本（网络中断 / 限流 / 仓库不存在或为私有）';
        } else if (baseSha === null) {
          // 首次检测：懒记录基准 = 当前远端，标最新（无基准无法判定，先把当前快照存下）
          status = 'up_to_date';
          newBase = remote;
        } else if (remote === baseSha) {
          status = 'up_to_date';
        } else {
          status = 'update_available';
        }
        upsertSkillUpdateState({
          tool: p.tool,
          name: p.name,
          sourceKey,
          sourceRevision: newBase,
          remoteRevision: remote,
          updateStatus: status,
          lastCheckedAt: now,
          lastCheckError: error,
        });
      }
    }

    metaSet(SETTING_KEYS.skillUpdateLastRun, String(now));
    const summary = summarizeCurrent(triggeredBy);
    summary.checked = checked;
    broadcastSkillUpdateChecked(summary);
    return summary;
  } finally {
    isRunning = false;
  }
}

/**
 * 应用单个 skill 的更新：用原 source 重装到「所有装了该 skill 的工具」。
 * 复用 installFromGithub/installFromMarket 的备份→覆盖→失败回滚。成功后基准前移、状态归位。
 */
export async function applySkillUpdate(tool: Tool, name: string): Promise<InstallResult[]> {
  const all = listInstalled();
  const row = all.find((s) => s.tool === tool && s.name === name);
  if (!row?.source) throw new Error('未找到该 skill 或其来源信息');
  const parsed = parseUpdateSource(row.source);
  if (!parsed) throw new Error('该 skill 无可用的远端更新源（仅 GitHub / 市场源可更新）');

  // 同名 skill 装在多个工具 → 一并更新（与卡片按 name 分组的语义一致）。
  // 排除「项目」类型：其 installRoot=projectRoot，重装会落到项目根而非 .<agent>/skills 错位；
  // 且项目 skill 多无 source、本就不可更新。
  const targets = Array.from(
    new Set(
      all.filter((s) => s.name === name && customKindOf(s.tool) !== 'project').map((s) => s.tool),
    ),
  );

  let results: InstallResult[];
  if (parsed.kind === 'github') {
    results = await installFromGithub(await githubWebUrl(parsed), targets);
  } else {
    if (!parsed.subpath) throw new Error('市场源缺少 skill 名，无法更新');
    results = await installFromMarket(`${parsed.owner}/${parsed.repo}/${parsed.subpath}`, targets);
  }

  // 成功则把基准前移到刚装版本（= 探测到的远端 SHA），状态归位
  if (results.some((r) => r.ok)) {
    const now = Date.now();
    const remote = getSkillUpdateState(tool, name)?.remoteRevision ?? null;
    const sourceKey = `${parsed.owner}/${parsed.repo}@${parsed.branch ?? 'HEAD'}`;
    for (const t of targets) {
      upsertSkillUpdateState({
        tool: t,
        name,
        sourceKey,
        sourceRevision: remote, // 刚装的就是 HEAD；若从未探测过则留 null，下次检测懒记录
        remoteRevision: remote,
        updateStatus: remote ? 'up_to_date' : 'unknown',
        lastCheckedAt: now,
        lastCheckError: null,
      });
    }
  }
  return results;
}

/** 把 interval 设置字符串解析为毫秒；'off'/未知 → 0（禁用）；默认 8h。 */
function parseInterval(v: string | null): number {
  switch (v) {
    case 'off':
      return 0;
    case '4h':
      return 4 * 3_600_000;
    case '12h':
      return 12 * 3_600_000;
    case '24h':
      return 24 * 3_600_000;
    case '8h':
    default:
      return 8 * 3_600_000; // 默认 8h（含 null / 未知值）
  }
}

/** 调度唤醒：读 interval + last_run，到期才跑一轮；错误吞掉（后台不炸）。 */
async function maybeRunRound(): Promise<void> {
  try {
    const interval = parseInterval(metaGet(SETTING_KEYS.skillUpdateInterval));
    if (interval === 0) return; // 关闭
    const last = Number(metaGet(SETTING_KEYS.skillUpdateLastRun) ?? 0);
    if (last && Date.now() - last < interval) return; // 未到期
    await checkSkillUpdatesInternal(false, 'auto');
  } catch (e) {
    console.error('[skill-update] 后台检测失败：', e);
  }
}

/**
 * 启动后台调度（在 main.ts whenReady 里、createWindow 之后调用）。
 * 启动后约 1 分钟首检（满足「每天打开后 1 分钟检测一遍」），之后每 15min 唤醒重判是否到期。
 */
export function startSkillUpdateScheduler(): void {
  setTimeout(() => {
    void maybeRunRound();
  }, STARTUP_DELAY_MS);
  setInterval(() => {
    void maybeRunRound();
  }, POLL_INTERVAL_MS).unref?.();
}
