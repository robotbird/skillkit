import { useEffect, useState } from 'react';
import type { InstalledSkill, ShareCreateResult } from '@shared/types';
import ModalPortal from './ModalPortal';
import { GitHubIcon } from './oauth-icons';
import { useI18n } from '../i18n';
import { githubSourceOf, githubShortLabel } from '../lib/github-source';

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
  // 可选：同步上传 skill 包到 skillkit.net（链接型分支用）
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<ShareCreateResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncCopied, setSyncCopied] = useState(false);

  // 重置状态
  useEffect(() => {
    if (open) {
      setBusy(false);
      setResult(null);
      setError(null);
      setCopied(false);
      setSyncBusy(false);
      setSyncResult(null);
      setSyncError(null);
      setSyncCopied(false);
    }
  }, [open, skill?.tool, skill?.name]);

  // Esc 关闭（busy 生成中不响应）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && !syncBusy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, syncBusy, onClose]);

  // GitHub 分支：生成跳转到 GitHub 仓库的短链（不上传包）
  async function generateLink() {
    if (!skill) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.skillkit.shareGithubLink(skill.tool, skill.name);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // 非 GitHub 分支：打包上传到 skillkit.net
  async function generateUpload() {
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

  // 可选：同步上传 skill 包（GitHub 分支）
  async function syncPackage() {
    if (!skill) return;
    setSyncBusy(true);
    setSyncError(null);
    try {
      const r = await window.skillkit.shareSkill(skill.tool, skill.name);
      setSyncResult(r);
    } catch (e: any) {
      setSyncError(e?.message ?? String(e));
    } finally {
      setSyncBusy(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  async function copySync() {
    if (!syncResult) return;
    await navigator.clipboard.writeText(syncResult.url);
    setSyncCopied(true);
    setTimeout(() => setSyncCopied(false), 1400);
  }

  if (!open || !skill) return null;

  const gh = githubSourceOf(skill);
  const expIn = result
    ? Math.max(0, Math.ceil((result.expiresAt - Date.now()) / (24 * 3600 * 1000)))
    : 7;
  const syncExpIn = syncResult
    ? Math.max(0, Math.ceil((syncResult.expiresAt - Date.now()) / (24 * 3600 * 1000)))
    : 7;

  const closeMask = () => {
    if (!busy && !syncBusy) onClose();
  };

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeMask();
        }}
      >
        <div className="modal share-modal">
          <h3>{t('share.title', { name: skill.name })}</h3>

          {gh ? (
            // ===== GitHub 来源：链接型分享 =====
            <>
              <div className="share-source">
                <GitHubIcon className="share-source-icon" />
                <span className="share-source-label">{githubShortLabel(gh)}</span>
                <span className="share-source-tag">{t('share.github.from')}</span>
              </div>

              {!result ? (
                <>
                  <p className="modal-sub">{t('share.github.desc')}</p>
                  {error && <div className="share-error">{error}</div>}
                  <div className="modal-actions">
                    <button className="btn-ghost" onClick={onClose} disabled={busy}>
                      {t('common.cancel')}
                    </button>
                    <button className="btn-primary" onClick={generateLink} disabled={busy}>
                      {busy ? <><span className="spinner" /> {t('share.generating')}</> : t('share.github.genShortLink')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="modal-sub">
                    {expIn === 0 ? t('share.github.doneToday') : t('share.github.doneDays', { days: expIn })}
                  </p>
                  <div className="share-link">
                    <code>{result.url}</code>
                    <button className="btn-primary" onClick={copy}>
                      {copied ? t('common.copied') : t('common.copy')}
                    </button>
                  </div>
                  <p className="muted-hint">{t('share.github.redirectHint')}</p>

                  {/* 可选：同步上传 skill 包到 skillkit.net，得到第二条（安装型）短链 */}
                  {!syncResult ? (
                    <div className="modal-actions">
                      <button className="btn-ghost" onClick={syncPackage} disabled={syncBusy}>
                        {syncBusy ? <><span className="spinner" /> {t('share.generating')}</> : t('share.github.optionalSync')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="modal-sub" style={{ marginTop: 14 }}>
                        {syncExpIn === 0 ? t('share.doneToday') : t('share.doneDays', { days: syncExpIn })}
                      </p>
                      <div className="share-link share-link-secondary">
                        <code>{syncResult.url}</code>
                        <button className="btn-primary" onClick={copySync}>
                          {syncCopied ? t('common.copied') : t('common.copy')}
                        </button>
                      </div>
                    </>
                  )}
                  {syncError && <div className="share-error">{syncError}</div>}

                  <div className="modal-actions">
                    <button className="btn-ghost" onClick={onClose} disabled={syncBusy}>
                      {t('common.close')}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            // ===== 非 GitHub：打包上传到 skillkit.net =====
            <>
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
                    <button className="btn-primary" onClick={generateUpload} disabled={busy}>
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
            </>
          )}
        </div>
      </div>
    </ModalPortal>
  );
}
