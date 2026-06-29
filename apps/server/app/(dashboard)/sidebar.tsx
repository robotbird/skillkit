'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

type IconName = 'user' | 'lock' | 'team';

function Icon({ name }: { name: IconName }) {
  if (name === 'user')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3.2-5.5 7-5.5s7 2 7 5.5" />
      </svg>
    );
  if (name === 'lock')
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M3.5 19c0-3 2.8-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
      <path d="M15 19c.2-2 1.8-3.6 4-3.8" />
    </svg>
  );
}

const ITEMS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: '个人信息', icon: 'user', match: (p) => p === '/' },
  { href: '/account', label: '账号管理', icon: 'lock', match: (p) => p.startsWith('/account') },
  { href: '/teams', label: '团队', icon: 'team', match: (p) => p.startsWith('/teams') },
];

export function Sidebar({ email, name }: { email: string; name: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [out, setOut] = useState(false);

  async function logout() {
    setOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
          <rect width="24" height="24" rx="6" fill="#ffb14a" />
          <path fill="#1a1410" d="M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z" />
        </svg>
        Skillkit
      </Link>
      <div className="nav-group">
        <div className="nav-label">账户</div>
        {ITEMS.map((it) => (
          <Link key={it.href} href={it.href} className={`nav-item${it.match(pathname) ? ' active' : ''}`}>
            <Icon name={it.icon} />
            {it.label}
          </Link>
        ))}
      </div>
      <div className="spacer" />
      <div className="sidebar-foot">
        <div className="sidebar-user">{name || email}</div>
        <div className="sidebar-email">{email}</div>
        <button type="button" className="btn-link" onClick={logout} disabled={out}>
          {out ? '退出中…' : '退出登录'}
        </button>
      </div>
    </aside>
  );
}
