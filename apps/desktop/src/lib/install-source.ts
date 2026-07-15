import { SHARE_BASE_URL } from '@shared/types';

/**
 * 智能识别用户粘贴的安装来源：skillkit.net 分享链接 / GitHub 仓库 / 未知。
 *
 * 纯函数，镜像后端判定规则：
 *  - 分享：`share.ts` 的 `parseShareId` —— `/share\/([A-Za-z0-9]{4,12})/` 或裸 `^[A-Za-z0-9]{4,12}$`
 *  - GitHub：`installer.ts` 的 `parseGithubRef` —— `owner/repo` 简写、`git@github.com:...`、hostname 以 `github.com` 结尾
 *
 * 仅用于渲染层「单输入框智能分派」，不改后端；真正安装时分享子流程仍会再跑一遍
 * `inspectShare` 兜底（链接型分享的 sourceUrl 会被改派到 GitHub 安装）。
 */
export type InstallSourceKind = 'share' | 'github' | 'unknown';

// /share/<id> 子串（对齐后端 parseShareId，不限定 host）
const SHARE_PATH_RE = /share\/[A-Za-z0-9]{4,12}/;
// 裸短链 ID
const BARE_ID_RE = /^[A-Za-z0-9]{4,12}$/;
// GitHub owner/repo 简写
const GITHUB_SHORT_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// git@github.com:owner/repo(.git)? SSH
const SSH_GITHUB_RE = /^git@github\.com:/;

// SHARE_BASE_URL 的 hostname（env 可覆盖，运行时计算并缓存）
let cachedShareHost: string | null = null;
function shareHost(): string {
  if (cachedShareHost == null) {
    try {
      cachedShareHost = new URL(SHARE_BASE_URL).hostname;
    } catch {
      cachedShareHost = 'skillkit.net';
    }
  }
  return cachedShareHost;
}

/**
 * 判定顺序敏感：`/share/<id>` 子串判定必须在 `owner/repo` 简写之前，
 * 否则 `share/abcd` 这种两者都匹配的输入会被误判为 GitHub。
 */
export function classifyInstallSource(raw: string): InstallSourceKind {
  const s = raw.trim();
  if (!s) return 'unknown';

  // 1. skillkit://share/<id> 深链
  if (s.startsWith('skillkit://')) {
    return SHARE_PATH_RE.test(s) ? 'share' : 'unknown';
  }
  // 2. git@github.com:... SSH（先于 new URL，否则会抛）
  if (SSH_GITHUB_RE.test(s)) return 'github';

  // 3. 完整 URL：按 hostname 判
  try {
    const u = new URL(s);
    const host = u.hostname;
    if (host === 'github.com' || host.endsWith('.github.com')) return 'github';
    if (host === shareHost() || host.endsWith('.' + shareHost())) {
      return SHARE_PATH_RE.test(s) ? 'share' : 'unknown';
    }
    // 其他 host：fallthrough 到子串 / 简写判定
  } catch {
    // 非 URL：fallthrough
  }

  // 4. 含 /share/<id> 子串 —— 必须先于 owner/repo（share/abcd 歧义）
  if (SHARE_PATH_RE.test(s)) return 'share';
  // 5. owner/repo 简写
  if (GITHUB_SHORT_RE.test(s)) return 'github';
  // 6. 裸 4-12 位 ID（对齐 parseShareId 裸 ID 默认 → 分享）
  if (BARE_ID_RE.test(s)) return 'share';

  return 'unknown';
}
