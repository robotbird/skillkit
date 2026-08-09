/**
 * GitHub 网络层（desktop 主进程）。
 *
 * 安装走 GitHub（codeload tarball / api.github.com / raw.githubusercontent.com）时，
 * 国内常因 DNS 污染 / 连接重置导致直连不畅。本模块统一做三件事：
 *
 * 1. 直连探测 + TTL 缓存：首个请求先试直连，{@link GH_NET_TIMEOUT_MS} 内拿不到响应头
 *    即判定直连不可用，标记后 5 分钟内的后续 GitHub 请求直接跳过直连、优先用国内公共镜像。
 * 2. 国内公共镜像回退：直连失败时按顺序逐个尝试镜像（前缀拼接形 `<mirror>https://...`），
 *    每个同样 6s 首字节超时；某个可用即用，失败跳过，全部失败才报错。
 * 3. 统一超时与网络错误文案：所有超时 / 不可达都抛含「网络 / 超时」关键词的中文错误，
 *    由 install-log 的 classifyInstallError 归类为 'network'，自动落到安装记录的网络错误徽标。
 *
 * 仅对 GitHub 域名生效；非 GitHub URL（如 skillkit.net 分享服务）原样直连，不加镜像。
 *
 * 故意不 import installer（installer 反向 import 本模块），避免循环依赖。
 */
import { Readable } from 'node:stream';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Writable } from 'node:stream';

/** 首字节 / 下载停滞超时（毫秒）。超过即判定「网络无反应」。用户要求 6s。 */
export const GH_NET_TIMEOUT_MS = 6000;
/** 直连可用性缓存有效期：超过则重新探测（5 分钟）。 */
const DIRECT_TTL_MS = 5 * 60 * 1000;

/**
 * 国内公共 GitHub 加速镜像。前缀拼接形：`<mirror>https://codeload.github.com/...`。
 * 这些公共服务经常变动 / 限流，故按顺序逐个尝试、失败即跳过；仅当全部失败才报网络错误。
 * 顺序大致按历史可用性排，可按需增删。
 */
const GH_MIRRORS = [
  'https://gh-proxy.com/',
  'https://ghproxy.com/',
  'https://mirror.ghproxy.com/',
  'https://github.moeyy.xyz/',
  'https://ghfast.top/',
  'https://gh.api.99988866.xyz/',
];

const GH_HOST_SUFFIXES = [
  'github.com',
  'api.github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
];

/** 是否 GitHub 域名的 URL（含其 CDN 子域）。 */
export function isGithubUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return GH_HOST_SUFFIXES.some((s) => h === s || h.endsWith('.' + s));
  } catch {
    return false;
  }
}

/** 用镜像前缀包一层：`https://ghproxy.com/https://codeload.github.com/...`。 */
function wrapWithMirror(originUrl: string, mirrorBase: string): string {
  const base = mirrorBase.endsWith('/') ? mirrorBase : mirrorBase + '/';
  return `${base}${originUrl}`;
}

// ===== 直连可用性缓存 =====
let directCache: { ok: boolean; at: number } | null = null;

/** 直连是否在 TTL 内被判定为不通（不通才需要跳过直连直接走镜像）。 */
function directKnownBlocked(): boolean {
  return directCache !== null && !directCache.ok && Date.now() - directCache.at < DIRECT_TTL_MS;
}

function markDirect(ok: boolean): void {
  directCache = { ok, at: Date.now() };
}

/** 候选 URL 列表：仅 GitHub 域名才追加镜像；已知直连不通则跳过直连。 */
function candidateUrls(url: string): string[] {
  if (!isGithubUrl(url)) return [url];
  const mirrors = GH_MIRRORS.map((m) => wrapWithMirror(url, m));
  return directKnownBlocked() ? mirrors : [url, ...mirrors];
}

/** 是否网络 / 超时类错误（决定是否回退下一个镜像候选）。HTTP 状态码错误不算。 */
function isFetchNetError(e: unknown): boolean {
  const any = e as any;
  if (!any) return false;
  if (any.name === 'AbortError') return true; // 首字节 / stall 超时
  const code: unknown = any?.cause?.code ?? any?.code;
  if (
    typeof code === 'string' &&
    (code.startsWith('UND_ERR_') ||
      /^(ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH)$/.test(code))
  ) {
    return true;
  }
  const msg = String(any?.message ?? '');
  return /fetch failed|terminated|other side closed|socket hang up|network|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(
    msg,
  );
}

/** 带首字节超时的 fetch：timeoutMs 内拿不到响应头即 abort（拿到响应头后 body 仍可继续读）。 */
async function fetchWithFirstByteTimeout(
  url: string,
  init: RequestInit,
  ctrl: AbortController,
  timeoutMs: number,
): Promise<Response> {
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 构造「直连与镜像均失败」的统一网络错误文案（含「网络」，确保归类为 network）。 */
function networkUnreachableError(timeoutMs: number, lastErr: unknown): Error {
  return new Error(
    `GitHub 网络不可达：直连与国内镜像均在 ${timeoutMs / 1000}s 内无响应（${
      (lastErr as any)?.message ?? lastErr
    }）。请检查网络或代理设置后重试`,
  );
}

/**
 * 小请求（API / raw）：首字节超时 + 镜像回退。拿到响应即返回（含 HTTP 错误状态，
 * 由调用方按状态码处理，HTTP 4xx/5xx 不会回退镜像）。全候选网络失败时抛网络错误。
 *
 * opts.noMirror：设了 GH_TOKEN 等鉴权时传 true，仅直连不回退镜像——避免 token 经
 * 公共镜像泄露给第三方。
 */
export async function githubFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = GH_NET_TIMEOUT_MS,
  opts: { noMirror?: boolean } = {},
): Promise<Response> {
  const candidates = opts.noMirror ? [url] : candidateUrls(url);
  const tryDirect = !directKnownBlocked();
  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const u = candidates[i];
    const isDirect = tryDirect && i === 0;
    const ctrl = new AbortController();
    try {
      const res = await fetchWithFirstByteTimeout(u, init, ctrl, timeoutMs);
      if (isDirect) markDirect(true);
      return res;
    } catch (e) {
      if (isDirect) markDirect(false); // 直连首字节超时 / 网络错 → 标记不通，后续直接走镜像
      lastErr = e;
      if (!isFetchNetError(e)) throw e; // 非网络错（代码 bug 等）直接抛，不回退
    }
  }
  throw networkUnreachableError(timeoutMs, lastErr);
}

export interface GithubStreamHandle {
  response: Response;
  ctrl: AbortController; // 供 body 下载时做停滞检测：stall 则 ctrl.abort()
  isDirect: boolean;
  url: string;
}

/**
 * 流式下载（tarball 等）：首字节超时 + 镜像回退。返回 response 与对应的 AbortController，
 * 供调用方在 body 下载阶段用 {@link pipelineWithStall} 做停滞检测。HTTP 错误状态同样直接返回。
 */
export async function githubStreamFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = GH_NET_TIMEOUT_MS,
  opts: { noMirror?: boolean } = {},
): Promise<GithubStreamHandle> {
  const candidates = opts.noMirror ? [url] : candidateUrls(url);
  const tryDirect = !directKnownBlocked();
  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const u = candidates[i];
    const isDirect = tryDirect && i === 0;
    const ctrl = new AbortController();
    try {
      const response = await fetchWithFirstByteTimeout(u, init, ctrl, timeoutMs);
      if (isDirect) markDirect(true);
      return { response, ctrl, isDirect, url: u };
    } catch (e) {
      if (isDirect) markDirect(false);
      lastErr = e;
      if (!isFetchNetError(e)) throw e;
    }
  }
  throw networkUnreachableError(timeoutMs, lastErr);
}

/**
 * 把 response.body pipeline 到 dest，期间若 stallMs 无新数据到达则视为下载停滞，
 * abort 连接（并按需标记直连不可用，供外层重试时直接走镜像）。
 *
 * 用一个 PassThrough「分接」数据流来更新 lastData 时间戳（PassThrough 转发数据给下游 dest，
 * 附加 on('data') 只是旁路监听，不会与下游抢数据）；定时器周期检查时间戳判定停滞。
 */
export async function pipelineWithStall(
  body: ReadableStream<Uint8Array>,
  dest: Writable,
  handle: GithubStreamHandle,
  stallMs: number = GH_NET_TIMEOUT_MS,
): Promise<void> {
  const nodeStream = Readable.fromWeb(body as any);
  let lastData = Date.now();
  const watcher = new PassThrough();
  watcher.on('data', () => {
    lastData = Date.now();
  });
  const tick = Math.min(1000, Math.max(200, stallMs / 3));
  const stallTimer = setInterval(() => {
    if (Date.now() - lastData > stallMs) {
      if (handle.isDirect) markDirect(false); // 下载停滞也按直连不通处理，重试直接走镜像
      handle.ctrl.abort();
      clearInterval(stallTimer);
    }
  }, tick);
  try {
    await pipeline(nodeStream, watcher, dest as unknown as NodeJS.WritableStream);
  } finally {
    clearInterval(stallTimer);
  }
}

/** 当前是否正在走镜像（直连在 TTL 内被判定为不通）。供 UI / 调试 / 日志判断。 */
export function githubDirectBlocked(): boolean {
  return directKnownBlocked();
}
