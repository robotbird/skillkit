'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: name.trim() || undefined }),
    });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setLoading(false);
      const d = await res.json().catch(() => null);
      setError(d?.error || '注册失败');
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <h1>注册 Skillkit</h1>
        <p className="muted">创建账号,开始管理团队 skill。</p>
        <div className="field" style={{ marginTop: 16 }}>
          <label>邮箱</label>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>密码</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          <div className="hint">至少 8 位</div>
        </div>
        <div className="field">
          <label>昵称(可选)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? '注册中…' : '注册'}
        </button>
        <div className="auth-foot">
          已有账号？<Link href="/login">登录</Link>
        </div>
      </div>
    </form>
  );
}
