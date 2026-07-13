'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/locale-provider';

export function EditNameForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const { t } = useT();
  const [name, setName] = useState(initial ?? '');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() || null }),
    });
    setLoading(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: t('editName.saved') });
      router.refresh();
    } else {
      const d = await res.json().catch(() => null);
      setMsg({ kind: 'error', text: d?.error || t('errors.saveFailed') });
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <Field>
        <FieldLabel htmlFor="name">{t('editName.nameLabel')}</FieldLabel>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('editName.placeholder')}
          maxLength={40}
        />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? t('editName.saving') : t('editName.save')}
        </Button>
        {msg && (
          <span
            className={cn(
              'text-sm',
              msg.kind === 'ok' ? 'text-emerald-600' : 'text-destructive',
            )}
          >
            {msg.text}
          </span>
        )}
      </div>
    </form>
  );
}
