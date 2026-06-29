'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function out() {
    setLoading(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }
  return (
    <form>
      <button type="button" className="btn-link" onClick={out} disabled={loading}>
        {loading ? '退出中…' : '退出'}
      </button>
    </form>
  );
}
