import { useEffect, useState } from 'react';
import type { InstalledSkill, ShareCreateResult } from '@shared/types';
import ModalPortal from './ModalPortal';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  skill: InstalledSkill | null;
  onClose: () => void;
}

export default function ShareDialog({ open, skill, onClose }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShareCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 重置状态
  useEffect(() => {
    if (open) {
      setBusy(false);
      setResult(null);
      setError(null);
      setCopied(false);
    }
  }, [open, skill?.tool, skill?.name]);

  // Esc 关闭（busy 生成中不响应）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  async function generate() {
    if (!skill) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.skillkit.shareSkill(skill.tool, skill.name);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  if (!open || !skill) return null;

  const expIn = result
    ? Math.max(0, Math.ceil((result.expiresAt - Date.now()) / (24 * 3600 * 1000)))
    : 7;

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        <div className="modal share-modal">
          <h3>{t('share.title', { name: skill.name })}</h3>

          {!result ? (
            <>
              <p className="modal-sub">
                {t('share.descPre')}<strong>{t('share.descBold')}</strong>{t('share.descPost')}
                <br />
                {t('share.warn')}
              </p>
              {error && <div className="share-error">{error}</div>}
              <div className="modal-actions">
                <button className="btn-ghost" onClick={onClose} disabled={busy}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" onClick={generate} disabled={busy}>
                  {busy ? <><span className="spinner" /> {t('share.generating')}</> : t('share.generate')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="modal-sub">
                {expIn === 0 ? t('share.doneToday') : t('share.doneDays', { days: expIn })}
              </p>
              <div className="share-link">
                <code>{result.url}</code>
                <button className="btn-primary" onClick={copy}>
                  {copied ? t('common.copied') : t('common.copy')}
                </button>
              </div>
              <p className="muted-hint">
                {t('share.shortIdLabel')}<code>{result.id}</code>
              </p>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={onClose}>
                  {t('common.close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
