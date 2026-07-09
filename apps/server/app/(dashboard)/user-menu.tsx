'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

function initials(name: string | null, email: string): string {
  const src = (name || email).trim();
  return src.slice(0, 1).toUpperCase() || '?';
}

/** 右上角头像 + 下拉(点击展开):账号设置 / 退出登录。 */
export function UserMenu({ name, email }: { name: string | null; email: string }) {
  const router = useRouter();
  const [out, setOut] = useState(false);

  async function logout() {
    setOut(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="cursor-pointer rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="账号菜单"
        >
          <Avatar className="size-8 border">
            <AvatarFallback className="text-xs">{initials(name, email)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">{name || email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">账号设置</Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={logout}
          disabled={out}
          className="text-destructive focus:text-destructive"
        >
          {out ? '退出中…' : '退出登录'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
