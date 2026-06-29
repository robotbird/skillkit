'use client';
import { Suspense, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push(next);
      router.refresh();
    } else {
      setLoading(false);
      const d = await res.json().catch(() => null);
      setError(d?.error || '登录失败');
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="card">
        <h1>登录 Skillkit</h1>
        <p className="muted">登录后管理你的团队 skill。</p>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
          {loading ? '登录中…' : '登录'}
        </button>
        <div className="auth-foot">
          还没账号？<Link href="/register">注册</Link>
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  // useSearchParams 须在 Suspense 内,否则 build 报错。
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
