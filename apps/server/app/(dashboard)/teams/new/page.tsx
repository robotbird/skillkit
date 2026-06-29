'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function NewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/teams/${data.team.id}`);
    } else {
      setLoading(false);
      const d = await res.json().catch(() => null);
      setError(d?.error || '创建失败');
    }
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>新建团队</h1>
      <p className="muted">为你的团队创建一个 skill 目录。</p>
      <div className="card" style={{ marginTop: 16 }}>
        <form onSubmit={submit}>
          <div className="field">
            <label>团队名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              placeholder="例如:前端基础设施"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="actions">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? '创建中…' : '创建团队'}
            </button>
            <button type="button" className="btn" onClick={() => router.back()}>
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
