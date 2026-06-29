'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function EditNameForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(initial ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || null }),
    });
    setLoading(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: '已保存' });
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setMsg({ kind: 'error', text: d?.error || '保存失败' });
    }
  }

  return (
    <form onSubmit={save} style={{ marginBottom: 14 }}>
      <div className="field">
        <label>昵称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="可选" maxLength={40} />
      </div>
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? '保存中…' : '保存昵称'}
        </button>
        {msg && <span className={msg.kind}>{msg.text}</span>}
      </div>
    </form>
  );
}
