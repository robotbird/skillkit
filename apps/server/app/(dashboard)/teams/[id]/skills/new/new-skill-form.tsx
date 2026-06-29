'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function NewSkillForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState<'github' | 'share'>('github');
  const [sourceRef, setSourceRef] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(`/api/teams/${teamId}/skills`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        sourceType,
        sourceRef: sourceRef.trim(),
      }),
    });
    if (res.ok) {
      router.push(`/teams/${teamId}`);
      router.refresh();
    } else {
      setLoading(false);
      const d = await res.json().catch(() => null);
      setError(d?.error || '添加失败');
    }
  }

  return (
    <div style={{ maxWidth: 540 }}>
      <h1>添加 skill</h1>
      <p className="muted">把一个 GitHub 仓库或已有分享链接加入团队目录。</p>
      <div className="card" style={{ marginTop: 16 }}>
        <form onSubmit={submit}>
          <div className="field">
            <label>名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              placeholder="例如:code-review"
            />
          </div>
          <div className="field">
            <label>描述(可选)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
            />
          </div>
          <div className="field">
            <label>来源类型</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as 'github' | 'share')}
            >
              <option value="github">GitHub 仓库</option>
              <option value="share">Skillkit 分享链接</option>
            </select>
          </div>
          <div className="field">
            <label>{sourceType === 'github' ? 'GitHub URL' : '分享码(6 位)'}</label>
            <input
              value={sourceRef}
              onChange={(e) => setSourceRef(e.target.value)}
              required
              placeholder={sourceType === 'github' ? 'https://github.com/owner/repo' : '如 a1b2c3'}
            />
            <div className="hint">
              {sourceType === 'github'
                ? '团队成员可复制该 URL,在桌面端通过 GitHub 安装。'
                : '填入已有的 Skillkit 分享码;成员打开后将跳转到分享接收页。'}
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="actions">
            <button className="btn btn-primary" disabled={loading}>
              {loading ? '添加中…' : '添加'}
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
