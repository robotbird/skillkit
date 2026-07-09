'use client';

import { useRouter } from 'next/navigation';
import type { MyShare } from '@skillkit/types';
import { formatBytes } from '@/lib/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SharesTable({ shares }: { shares: MyShare[] }) {
  if (!shares.length) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
        还没有分享过 skill。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>链接</TableHead>
            <TableHead>分享时间</TableHead>
            <TableHead>大小</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shares.map((s) => (
            <ShareRow key={s.id} s={s} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ShareRow({ s }: { s: MyShare }) {
  const router = useRouter();

  async function del() {
    const r = await fetch(`/api/my/shares/${s.id}`, { method: 'DELETE' });
    if (r.ok) {
      router.refresh();
    } else {
      const d = await r.json().catch(() => null);
      alert(d?.error || '删除失败');
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{s.name}</TableCell>
      <TableCell className="max-w-[280px]">
        <a
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          title={s.url}
        >
          {s.url}
        </a>
      </TableCell>
      <TableCell className="text-muted-foreground">{formatTime(s.createdAt)}</TableCell>
      <TableCell className="text-muted-foreground">{formatBytes(s.sizeBytes)}</TableCell>
      <TableCell>
        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                <MoreIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="text-destructive focus:text-destructive"
                >
                  删除
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除这个分享？</AlertDialogTitle>
              <AlertDialogDescription>
                将删除短链与文件，此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={del}>删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
      <circle cx="12" cy="5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="19" r="1.6" />
    </svg>
  );
}
