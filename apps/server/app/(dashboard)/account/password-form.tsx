'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function PasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setMsg({ kind: 'error', text: '两次输入的新密码不一致' });
      return;
    }
    setLoading(true);
    setMsg(null);
    const res = await fetch('/api/me/password', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);
    if (res.ok) {
      setCurrent('');
      setNew('');
      setConfirm('');
      setMsg({ kind: 'ok', text: '密码已更新,其他设备需用新密码重新登录' });
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setMsg({ kind: 'error', text: d?.error || '修改失败' });
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>当前密码</label>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label>新密码</label>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
          required
          minLength={8}
        />
        <div className="hint">至少 8 位</div>
      </div>
      <div className="field">
        <label>确认新密码</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
        />
      </div>
      {msg && <div className={msg.kind}>{msg.text}</div>}
      <button className="btn btn-primary btn-sm" disabled={loading}>
        {loading ? '更新中…' : '更新密码'}
      </button>
    </form>
  );
}
