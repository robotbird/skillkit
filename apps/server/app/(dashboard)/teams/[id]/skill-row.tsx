'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TeamSkill } from '@skillkit/types';

// 团队 skill 卡片:github 显示并复制仓库 URL;share 跳转现有 /share/[id] 接收页;成员可移除。
export function SkillRow({ skill }: { skill: TeamSkill }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState('');

  const isGithub = skill.sourceType === 'github';
  const href = isGithub ? skill.sourceRef : `/share/${skill.sourceRef}`;

  async function copy() {
    const text = isGithub ? skill.sourceRef : `${window.location.origin}/share/${skill.sourceRef}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setErr('复制失败,请手动复制');
    }
  }

  async function remove() {
    if (!window.confirm(`确认从团队移除「${skill.name}」?`)) return;
    setRemoving(true);
    setErr('');
    const res = await fetch(`/api/teams/${skill.teamId}/skills/${skill.id}`, { method: 'DELETE' });
    setRemoving(false);
    if (res.ok) router.refresh();
    else {
      const d = await res.json().catch(() => null);
      setErr(d?.error || '删除失败');
    }
  }

  return (
    <div className="list-item">
      <div className="main">
        <span className="title">
          <a href={href} target={isGithub ? '_blank' : undefined} rel={isGithub ? 'noopener noreferrer' : undefined}>
            {skill.name}
          </a>
        </span>
        <span className="sub">
          {skill.description ? skill.description + ' · ' : ''}
          {isGithub ? skill.sourceRef : `分享码 ${skill.sourceRef}`}
        </span>
        {err && (
          <span className="error" style={{ margin: 0 }}>
            {err}
          </span>
        )}
      </div>
      <div className="actions">
        <span className="chip muted">{isGithub ? 'GitHub' : '分享'}</span>
        <button className="btn btn-sm" onClick={copy}>
          {copied ? '已复制' : '复制链接'}
        </button>
        <button className="btn btn-sm btn-danger" onClick={remove} disabled={removing}>
          {removing ? '…' : '移除'}
        </button>
      </div>
    </div>
  );
}
