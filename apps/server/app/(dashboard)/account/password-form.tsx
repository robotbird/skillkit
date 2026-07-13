'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/locale-provider';

export function PasswordForm() {
  const router = useRouter();
  const { t } = useT();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setMsg({ kind: 'error', text: t('errors.passwordMismatch') });
      return;
    }
    setLoading(true);
    setMsg(null);
    const res = await fetch('/api/me/password', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setLoading(false);
    if (res.ok) {
      setCurrent('');
      setNew('');
      setConfirm('');
      setMsg({ kind: 'ok', text: t('password.success') });
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setMsg({ kind: 'error', text: d?.error || t('errors.passwordUpdateFailed') });
    }
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="current-password">{t('password.currentLabel')}</FieldLabel>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="new-password">{t('password.newLabel')}</FieldLabel>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">{t('password.hint')}</p>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">{t('password.confirmLabel')}</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        {msg && (
          <p
            className={cn(
              'text-sm',
              msg.kind === 'ok' ? 'text-emerald-600' : 'text-destructive',
            )}
          >
            {msg.text}
          </p>
        )}
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? t('password.submitting') : t('password.submit')}
        </Button>
      </FieldGroup>
    </form>
  );
}
