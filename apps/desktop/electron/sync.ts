import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeStorage } from 'electron';
import { metaGet, metaSet } from './db.js';
import { globalRepoRoot } from './global-repo.js';
import { SETTING_KEYS } from '../shared/types.js';
import type { SyncActionResult, SyncConfigureInput, SyncConfig, SyncStatusInfo } from '../shared/types.js';

/**
 * 全局仓库（~/.agents/skills）的 Git 同步：把规范副本库备份到用户自建的远程仓库（GitHub 等）。
 * 形态（docs/git-sync.md 定稿）：
 * - 目录即仓库：~/.agents/skills 原地 git init，skills 在仓库根；.git 点前缀扫描天然跳过。
 * - 单向推送：变更后防抖自动 add/commit/push；push 被拒 → pull --rebase 重试，不强推。
 * - 手动全量恢复：fetch + reset --hard + clean（覆盖本地，调用方须先弹确认）。
 * - 凭据：HTTPS 可配 PAT（safeStorage 加密，命令级 -c extraheader 注入，不落盘不进 argv 明文）；
 *   未配 PAT 或 SSH 地址则回落系统 git 凭据链（osxkeychain / gh / ssh key）。
 * 环境固定 GIT_TERMINAL_PROMPT=0 + ssh BatchMode，杜绝任何交互式提示挂起主进程。
 */

const execFileAsync = promisify(execFile);

/** 变更后自动同步的防抖窗口：连续安装/卸载合并为一次 push。 */
const DEBOUNCE_MS = 5000;
const GIT_TIMEOUT_MS = 30_000;
const GIT_NETWORK_TIMEOUT_MS = 180_000; // push/fetch 可能走大仓库
const MAX_BUFFER = 10 * 1024 * 1024;

// ===== PAT 安全存储（与 account.ts 的 auth_token 同模式：safeStorage 优先，降级明文加前缀）=====
const ENC_PREFIX = 'enc:';
const PLAIN_PREFIX = 'plain:';

function storeSecret(key: string, value: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    metaSet(key, ENC_PREFIX + safeStorage.encryptString(value).toString('base64'));
  } else {
    metaSet(key, PLAIN_PREFIX + value);
  }
}

function loadSecret(key: string): string | null {
  const v = metaGet(key);
  if (!v) return null;
  if (v.startsWith(ENC_PREFIX)) {
    try {
      return safeStorage.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), 'base64'));
    } catch {
      return null;
    }
  }
  if (v.startsWith(PLAIN_PREFIX)) return v.slice(PLAIN_PREFIX.length);
  return null;
}

// ===== git 子进程封装 =====

class GitError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message);
  }
}

/** 常见 git 网络类错误 → 中文摘要；未命中返回 null（调用方回落截断的原始输出）。 */
function classifyGitError(raw: string): string | null {
  if (/Authentication failed|could not read Username|Permission denied|publickey|403/i.test(raw)) {
    return '认证失败：请检查 PAT 权限（需 repo 写权限）或系统 git 凭据；SSH 地址请确认密钥可用';
  }
  if (/Repository not found|does not exist|404/i.test(raw)) {
    return '仓库不存在或无权访问：请核对地址';
  }
  if (/Could not resolve|timed out|Connection|SSL|dial tcp/i.test(raw)) {
    return '网络错误：无法连接远程仓库';
  }
  if (/conflict/i.test(raw)) {
    return '远程与本地历史冲突：请在仓库中手动处理（如 git pull --rebase）后重试';
  }
  return null;
}

function truncate(s: string, max = 300): string {
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

/** 交互全部关死：git 不弹终端提示，ssh 走 BatchMode + 首连自动接受 host key（TOFU）。 */
function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new',
    LC_ALL: 'C', // 输出固定英文，便于错误归类与退出文案解析
  };
}

/** 从仓库地址提取 http extraheader 的作用域前缀（https://github.com/），SSH/非法地址返回 null。 */
function httpScopeOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

interface GitOpts {
  cwd?: string;
  /** PAT 存在且仓库为 http(s) 时命令级注入 Authorization 头（凭据不进 config / argv 明文）。 */
  token?: string | null;
  url?: string;
  timeoutMs?: number;
}

async function runGit(args: string[], opts: GitOpts = {}): Promise<string> {
  const finalArgs = [...args];
  const scope = opts.token && opts.url ? httpScopeOf(opts.url) : null;
  if (opts.token && scope) {
    // GitHub PAT 走 basic（用户名固定 x-access-token）；仅作用于该 host 前缀
    const basic = Buffer.from(`x-access-token:${opts.token}`).toString('base64');
    finalArgs.unshift('-c', `http.${scope}extraheader=AUTHORIZATION: basic ${basic}`);
  }
  try {
    const { stdout } = await execFileAsync('git', finalArgs, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      env: gitEnv(),
    });
    return stdout;
  } catch (err: any) {
    const raw = `${err?.stderr || ''}\n${err?.stdout || ''}\n${err?.message || ''}`;
    throw new GitError(classifyGitError(raw) ?? truncate(raw), raw);
  }
}

// ===== 系统 git 可用性（成功后缓存；失败则每次探测，便于用户装好 git 后自愈）=====
let gitAvailableCache: boolean | null = null;

async function gitAvailable(): Promise<boolean> {
  if (gitAvailableCache === true) return true;
  try {
    await runGit(['--version']);
    gitAvailableCache = true;
  } catch {
    gitAvailableCache = false;
  }
  return gitAvailableCache;
}

// ===== 配置读写 =====

function loadConfig(): SyncConfig & { token: string | null } {
  return {
    repoUrl: metaGet(SETTING_KEYS.syncRepoUrl) || '',
    auto: metaGet(SETTING_KEYS.syncAuto) === '1',
    hasToken: !!loadSecret(SETTING_KEYS.syncAuthToken),
    token: loadSecret(SETTING_KEYS.syncAuthToken),
  };
}

/** 上次同步状态（sync_last_status 存 JSON：{ ok, error, summary }）。 */
function loadLastStatus(): { time: number | null; ok: boolean | null; error: string | null; summary: string | null } {
  const t = Number(metaGet(SETTING_KEYS.syncLastTime));
  const raw = metaGet(SETTING_KEYS.syncLastStatus);
  let parsed: any = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  return {
    time: t > 0 ? t : null,
    ok: parsed ? !!parsed.ok : null,
    error: parsed?.error ?? null,
    summary: parsed?.summary ?? null,
  };
}

function recordStatus(ok: boolean, error?: string, summary?: string, commit?: string): void {
  metaSet(SETTING_KEYS.syncLastTime, String(Date.now()));
  metaSet(
    SETTING_KEYS.syncLastStatus,
    JSON.stringify({ ok, error: ok ? null : error ?? null, summary: summary ?? null, commit: commit ?? null }),
  );
}

/** 地址合法性：https:// / http:// / ssh:// / git@host:path 四种形态。 */
function validRepoUrl(url: string): boolean {
  return /^(https?:\/\/|ssh:\/\/)\S+$/.test(url) || /^git@\S+:\S+$/.test(url);
}

// ===== 仓库就位（init + .gitignore + remote）=====

const GITIGNORE = ['.DS_Store', '*.bak-*', '.skill-lock.json', ''].join('\n');

async function ensureRepo(repoUrl: string, token: string | null): Promise<void> {
  const root = globalRepoRoot();
  fs.mkdirSync(root, { recursive: true });
  if (!fs.existsSync(path.join(root, '.git'))) {
    try {
      await runGit(['init', '-b', 'main'], { cwd: root }); // git ≥ 2.28
    } catch {
      await runGit(['init'], { cwd: root }); // 老 git：默认分支名随全局配置，后续一律用 HEAD 不硬编码
    }
  }
  const gi = path.join(root, '.gitignore');
  if (!fs.existsSync(gi)) fs.writeFileSync(gi, GITIGNORE, 'utf8');
  // remote 统一 remove+add：配置页改地址后 origin 始终指向当前值
  try {
    await runGit(['remote', 'remove', 'origin'], { cwd: root });
  } catch {
    /* 无 origin */
  }
  await runGit(['remote', 'add', 'origin', repoUrl], { cwd: root, token, url: repoUrl });
}

// ===== 同步主流程 =====

let syncing = false;
let rerunQueued = false;

/** 解析 porcelain 行 → "+A -D ~M" 变更统计。 */
function summarizePorcelain(out: string): string | null {
  const lines = out.split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  let a = 0;
  let d = 0;
  let m = 0;
  for (const l of lines) {
    if (/^[AR]/.test(l)) a++;
    else if (/^D/.test(l)) d++;
    else m++;
  }
  const parts: string[] = [];
  if (a) parts.push(`+${a}`);
  if (d) parts.push(`-${d}`);
  if (!a && !d && m) parts.push(`~${m}`);
  return parts.join(' ') || null;
}

/** 无 git 身份的机器（新装常见）缺哪个补哪个（Skillkit 兜底，命令级 -c 不落盘不污染全局配置）。
 *  commit 与 rebase 都需要身份（rebase 重建提交同样以本机为 committer），故两处统一走本辅助。 */
async function identityFallbackArgs(cwd: string): Promise<string[]> {
  const has = (key: string) => runGit(['config', key], { cwd }).then(() => true).catch(() => false);
  const args: string[] = [];
  if (!(await has('user.name'))) args.push('-c', 'user.name=Skillkit');
  if (!(await has('user.email'))) args.push('-c', 'user.email=skillkit@local');
  return args;
}

async function commitAll(root: string, summary: string): Promise<void> {
  const stamp = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
  const msg = `sync: ${summary} skills · ${date}`;
  await runGit([...(await identityFallbackArgs(root)), 'commit', '-m', msg], { cwd: root });
}

async function pushWithRebase(root: string, repoUrl: string, token: string | null): Promise<void> {
  const opts: GitOpts = { cwd: root, token, url: repoUrl, timeoutMs: GIT_NETWORK_TIMEOUT_MS };
  try {
    await runGit(['push', '-u', 'origin', 'HEAD'], opts);
    return;
  } catch (e) {
    const raw = e instanceof GitError ? e.raw : String(e);
    if (!/non-fast-forward|fetch first|rejected|failed to push some refs/i.test(raw)) throw e;
  }
  // 远端领先（另一台机器推过）：rebase 到远端再推；冲突则中止并报错（不强推，docs Q8）
  const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root })).trim();
  if (!branch || branch === 'HEAD') throw new GitError('无法确定当前分支，请手动同步', '');
  try {
    // rebase 重建提交同样需要 committer 身份：新机器无 git 身份时与 commit 一致补 Skillkit 兜底
    await runGit([...(await identityFallbackArgs(root)), 'pull', '--rebase', 'origin', branch], opts);
    await runGit(['push', '-u', 'origin', 'HEAD'], opts);
  } catch (e) {
    try {
      await runGit(['rebase', '--abort'], { cwd: root });
    } catch {
      /* ignore */
    }
    // 两台机器各自产生过首个提交（历史分叉）时最常见：指路「从远程恢复」整量覆盖，避免用户卡在原始冲突输出上
    const raw = e instanceof GitError ? e.raw : String(e);
    if (/conflict/i.test(raw)) {
      throw new GitError(
        '远程与本地历史冲突：可点「从远程恢复」以远程内容覆盖本地后重新同步（本地未备份的变更会丢失），或手动在仓库中处理冲突',
        raw,
      );
    }
    throw e;
  }
}

/**
 * 单次同步：add -A →（有变更才）commit → push（被拒则 rebase 重试）。
 * 无变更 / 仓库为空均视为成功空跑（pushed=false），不产生提交。
 */
export async function syncNow(trigger: 'manual' | 'auto' = 'manual'): Promise<SyncActionResult> {
  const { repoUrl, token } = loadConfig();
  if (!repoUrl) return { ok: false, error: '尚未配置远程仓库' };
  if (!(await gitAvailable())) return { ok: false, error: '未检测到系统 git，请先安装 git' };
  if (syncing) {
    if (trigger === 'auto') rerunQueued = true; // 同步中又有变更：完成后补跑一次，不丢
    return { ok: false, error: '同步正在进行中' };
  }
  syncing = true;
  try {
    const root = globalRepoRoot();
    await ensureRepo(repoUrl, token);
    await runGit(['add', '-A'], { cwd: root });
    const status = await runGit(['status', '--porcelain'], { cwd: root });
    const summary = summarizePorcelain(status);
    if (!summary) {
      // 空跑也要走一次推送链路而非仅探测可达：既及早暴露 404/认证问题，
      // 也把上次失败（如 push 被拒后 rebase 中断）遗留在本地的提交补推上去；up-to-date 时空推代价与 ls-remote 相同。
      // 仓库还没有任何提交时无 HEAD 可推，跳过（首次变更提交后才进推送链路）。
      const hasHead = await runGit(['rev-parse', '--verify', '-q', 'HEAD'], { cwd: root })
        .then(() => true)
        .catch(() => false);
      if (hasHead) await pushWithRebase(root, repoUrl, token);
      recordStatus(true, undefined, undefined);
      return { ok: true, pushed: false };
    }
    await commitAll(root, summary);
    await pushWithRebase(root, repoUrl, token);
    const commit = (await runGit(['rev-parse', '--short', 'HEAD'], { cwd: root })).trim();
    recordStatus(true, undefined, summary, commit);
    return { ok: true, pushed: true, summary, commit };
  } catch (e: any) {
    const error = e?.message || String(e);
    recordStatus(false, error);
    return { ok: false, error };
  } finally {
    syncing = false;
    if (rerunQueued) {
      rerunQueued = false;
      void syncNow('auto').catch(() => {});
    }
  }
}

// ===== 从远程整量恢复（Q9：覆盖本地，调用方须先弹确认）=====

export async function restoreFromRemote(): Promise<SyncActionResult> {
  const { repoUrl, token } = loadConfig();
  if (!repoUrl) return { ok: false, error: '尚未配置远程仓库' };
  if (!(await gitAvailable())) return { ok: false, error: '未检测到系统 git，请先安装 git' };
  if (syncing) return { ok: false, error: '同步正在进行中，请稍后' };
  syncing = true;
  try {
    const root = globalRepoRoot();
    await ensureRepo(repoUrl, token);
    // 远端默认分支：ls-remote --symref 首行 "ref: refs/heads/<branch>\tHEAD"
    const sym = await runGit(['ls-remote', '--symref', 'origin', 'HEAD'], {
      cwd: root,
      token,
      url: repoUrl,
      timeoutMs: GIT_NETWORK_TIMEOUT_MS,
    });
    const m = sym.match(/^ref:\s*refs\/heads\/(\S+)/m);
    if (!m) return { ok: false, error: '远程仓库为空，没有可恢复的内容' };
    const branch = m[1];
    const net: GitOpts = { cwd: root, token, url: repoUrl, timeoutMs: GIT_NETWORK_TIMEOUT_MS };
    await runGit(['fetch', 'origin', branch], net);
    await runGit(['reset', '--hard', 'FETCH_HEAD'], net);
    await runGit(['clean', '-fd'], net); // 清未跟踪；.gitignore 忽略项（.DS_Store 等）不动
    recordStatus(true, undefined, undefined);
    return { ok: true };
  } catch (e: any) {
    const error = e?.message || String(e);
    recordStatus(false, `恢复失败：${error}`);
    return { ok: false, error };
  } finally {
    syncing = false;
  }
}

// ===== 连接测试 / 配置 / 状态 =====

/** ls-remote 探测可达性与权限；不落任何配置。token 省略时用已存的。 */
export async function testRemote(url: string, token?: string): Promise<SyncActionResult> {
  if (!(await gitAvailable())) return { ok: false, error: '未检测到系统 git，请先安装 git' };
  if (!validRepoUrl(url)) return { ok: false, error: '地址格式不支持：请填 https:// 或 git@ 开头的仓库地址' };
  const useToken = token && token.length > 0 ? token : loadConfig().token;
  try {
    // ls-remote 直接带 URL（不依赖 origin），在任何目录下可执行
    await runGit(['ls-remote', url, 'HEAD'], { token: useToken, url, timeoutMs: GIT_NETWORK_TIMEOUT_MS });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** 保存配置并立即首次同步（Q12：错误尽早暴露）。token 三态：undefined=保留 / ''=清除 / 非空=覆盖。 */
export async function configureSync(input: SyncConfigureInput): Promise<SyncActionResult> {
  const url = input.repoUrl.trim();
  if (url && !validRepoUrl(url)) {
    return { ok: false, error: '地址格式不支持：请填 https:// 或 git@ 开头的仓库地址' };
  }
  metaSet(SETTING_KEYS.syncRepoUrl, url);
  metaSet(SETTING_KEYS.syncAuto, input.auto ? '1' : '0');
  if (input.token !== undefined) {
    if (input.token === '') metaSet(SETTING_KEYS.syncAuthToken, '');
    else storeSecret(SETTING_KEYS.syncAuthToken, input.token);
  }
  if (!url) {
    recordStatus(true, undefined, undefined); // 停用：清状态
    return { ok: true };
  }
  return syncNow('manual');
}

export async function getSyncStatus(): Promise<SyncStatusInfo> {
  const { repoUrl, auto, hasToken } = loadConfig();
  const last = loadLastStatus();
  return {
    configured: !!repoUrl,
    config: { repoUrl, auto, hasToken },
    lastTime: last.time,
    lastOk: last.ok,
    lastError: last.error,
    lastSummary: last.summary,
    gitAvailable: await gitAvailable(),
    syncing,
  };
}

// ===== 变更钩子（ipc.ts 各变更 handler / main.ts 启动后调用）=====

let debounceTimer: NodeJS.Timeout | null = null;

/** 防抖触发自动同步：未配置或自动开关关着则静默跳过。 */
export function scheduleSkillSync(): void {
  const url = metaGet(SETTING_KEYS.syncRepoUrl);
  if (!url || metaGet(SETTING_KEYS.syncAuto) !== '1') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow('auto').catch(() => {});
  }, DEBOUNCE_MS);
}
