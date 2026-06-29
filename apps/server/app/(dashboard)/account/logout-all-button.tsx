'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LogoutAllButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function out() {
    if (!window.confirm('确认登出所有设备?其他设备的登录将立即失效,当前设备也会退出。')) return;
    setLoading(true);
    await fetch('/api/me/logout-all', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button className="btn btn-danger" onClick={out} disabled={loading}>
      {loading ? '处理中…' : '登出所有设备'}
    </button>
  );
}
