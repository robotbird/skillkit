import { useCallback, useEffect, useState } from 'react';
import type { PublicUser, AccountLoginResult } from '@shared/types';

/**
 * 桌面账号（token 鉴权）。挂载时取当前账号信息；login/logout 由设置弹窗「账号」分区调用。
 * 失败/未登录均落到 user=null。
 */
export function useAccount() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  return { user, loading, refresh, login, logout };
}
