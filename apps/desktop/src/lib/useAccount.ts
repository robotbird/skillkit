import { useCallback, useEffect, useState } from 'react';
import type { PublicUser, AccountLoginResult, OAuthProvider } from '@shared/types';

/**
 * 桌面账号（token 鉴权）。挂载时取当前账号信息；login/logout 由设置弹窗「账号」分区调用。
 * 第三方登录（GitHub/Google）经 startOAuth 在系统浏览器完成，回调通过 skillkit://auth 深链
 * 回到主进程，换 token 后经 onOAuthResult 推结果到这里：成功更新 user，失败落到 oauthError。
 * 失败/未登录均落到 user=null。
 */
export function useAccount() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [oauthPending, setOauthPending] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const u = await window.skillkit.getAccountInfo();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // OAuth 回调结果：主进程换 token 成功后推送。组件卸载时移除监听，避免重复回调。
  useEffect(() => {
    return window.skillkit.onOAuthResult((r: AccountLoginResult) => {
      setOauthPending(false);
      if (r.ok && r.user) {
        setUser(r.user);
        setOauthError(null);
      } else {
        setOauthError(r.error ?? null);
      }
    });
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AccountLoginResult> => {
      const r = await window.skillkit.loginAccount(email, password);
      if (r.ok && r.user) setUser(r.user);
      return r;
    },
    [],
  );

  const logout = useCallback(async () => {
    await window.skillkit.logoutAccount();
    setUser(null);
  }, []);

  const startOAuth = useCallback(async (provider: OAuthProvider) => {
    setOauthError(null);
    setOauthPending(true);
    try {
      await window.skillkit.startOAuth(provider);
    } catch {
      setOauthPending(false);
      setOauthError('无法打开浏览器');
    }
  }, []);

  const clearOAuthError = useCallback(() => setOauthError(null), []);

  return { user, loading, refresh, login, logout, startOAuth, oauthPending, oauthError, clearOAuthError };
}
