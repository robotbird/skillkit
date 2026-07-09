'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: name.trim() || undefined }),
    });
    if (res.ok) {
      router.push('/');
      router.refresh();
    } else {
      setLoading(false);
      const d = await res.json().catch(() => null);
      setError(d?.error || '注册失败');
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>注册 Skillkit</CardTitle>
        <CardDescription>创建账号，开始管理分享。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor="email">邮箱</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">密码</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="text-xs text-muted-foreground">至少 8 位</p>
            </Field>
            <Field>
              <FieldLabel htmlFor="name">昵称（可选）</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '注册中…' : '注册'}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            已有账号？
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              登录
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
