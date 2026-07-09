'use client';

import { Suspense, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push(next);
      router.refresh();
    } else {
      setLoading(false);
      const d = await res.json().catch(() => null);
      setError(d?.error || '登录失败');
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>登录 Skillkit</CardTitle>
        <CardDescription>登录后管理你的分享。</CardDescription>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            还没账号？
            <Link href="/register" className="text-foreground underline-offset-4 hover:underline">
              注册
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  // useSearchParams 须在 Suspense 内,否则 build 报错。
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
