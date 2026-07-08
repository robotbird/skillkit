import { app, safeStorage, shell } from 'electron';
import { metaGet, metaSet } from './db.js';
import { SETTING_KEYS } from '../shared/types.js';
import type { PublicUser, AccountLoginResult } from '../shared/types.js';

// 账号服务基地址：
// - 本地开发（未打包）默认指向本地 server (http://localhost:3000)，方便联调注册/登录；
// - 打包发布默认指向 account.skillkit.net 子域（需 Vercel/DNS 配置指向现有 /login）；
// - 任意环境都可用 SKILLKIT_ACCOUNT_BASE_URL 覆盖。
export const ACCOUNT_BASE_URL =
  process.env.SKILLKIT_ACCOUNT_BASE_URL ||
  (app.isPackaged ? 'https://account.skillkit.net' : 'http://localhost:3000');

/** 用系统浏览器打开账号网页（注册 / 登录 / 账号管理）。URL 由主进程拼，渲染层不感知域名。 */
export async function openAccountPage(page: 'login' | 'register' | 'account'): Promise<void> {
  await shell.openExternal(`${ACCOUNT_BASE_URL}/${page}`);
}

// 桌面 token 鉴权：与 web cookie session 同源 JWT（signSession），只是 token 走响应体给桌面存储。
// 存储用 Electron safeStorage（OS keychain 加密）；不可用时降级明文（前缀区分，便于读回）。
const ENC_PREFIX = 'enc:';
const PLAIN_PREFIX = 'plain:';

/** 加密存 token（safeStorage 不可用则降级明文）。 */
function storeToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(token).toString('base64');
    metaSet(SETTING_KEYS.authToken, ENC_PREFIX + enc);
  } else {
    metaSet(SETTING_KEYS.authToken, PLAIN_PREFIX + token);
  }
}

/** 读出 token（解密；空或损坏返回 null）。 */
function loadToken(): string | null {
  const v = metaGet(SETTING_KEYS.authToken);
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

/** 清除本地 token（登出）。 */
function clearToken(): void {
  metaSet(SETTING_KEYS.authToken, '');
}

/**
 * 桌面账号登录：POST /api/auth/token（主进程发请求，规避渲染层跨域 CORS）。
 * 成功则存 token 并返回 user；失败返回错误文案（与 web 登录一致，防用户枚举）。
 */
export async function loginAccount(email: string, password: string): Promise<AccountLoginResult> {
  try {
    const r = await fetch(`${ACCOUNT_BASE_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) {
      return { ok: false, error: body?.error || '登录失败' };
    }
    const { token, user } = body as { token: string; user: PublicUser };
    storeToken(token);
    return { ok: true, user };
  } catch (e) {
    // 网络错误 / 子域未就绪
    return { ok: false, error: '无法连接账号服务，请检查网络后重试' };
  }
}

/**
 * 取当前账号信息：带 Authorization: Bearer 调 /api/me。
 * 401（token 失效）则清本地 token；其他失败返回 null（保留 token 待重试）。
 */
export async function getAccountInfo(): Promise<PublicUser | null> {
  const token = loadToken();
  if (!token) return null;
  try {
    const r = await fetch(`${ACCOUNT_BASE_URL}/api/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (r.status === 401) {
      clearToken();
      return null;
    }
    if (!r.ok) return null;
    const { user } = (await r.json()) as { user: PublicUser };
    return user;
  } catch {
    return null; // 网络错误，保留 token，下次重试
  }
}

/**
 * 登出：仅清本地 token。
 * 服务端失效依赖 web 端「全设备登出」（bump tokenVersion）；v1 桌面登出不做服务端失效，
 * token 自然 7 天过期。如需即时失效可后续加 /api/auth/revoke。
 */
export async function logoutAccount(): Promise<void> {
  clearToken();
}
