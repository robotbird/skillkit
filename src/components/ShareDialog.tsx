import { useEffect, useState } from 'react';
import type { InstalledSkill, ShareCreateResult } from '@shared/types';

interface Props {
  open: boolean;
  skill: InstalledSkill | null;
  onClose: () => void;
}

export default function ShareDialog({ open, skill, onClose }: Props) {
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

  async function generate() {
    if (!skill) return;
    setBusy(true);
    setError(null);
    try {
      const r = await window.skillzix.shareSkill(skill.tool, skill.name);
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
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal share-modal">
        <h3>分享 {skill.name}</h3>

        {!result ? (
          <>
            <p className="modal-sub">
              该 skill 会被压缩并上传到分享服务，<strong>任何人 7 天内</strong>通过链接都能安装。
              <br />
              请确认其中不包含敏感信息。
            </p>
            {error && <div className="share-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose} disabled={busy}>
                取消
              </button>
              <button className="btn-primary" onClick={generate} disabled={busy}>
                {busy ? <><span className="spinner" /> 生成中</> : '生成分享链接'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="modal-sub">
              ✓ 链接已生成，{expIn === 0 ? '今天到期' : `${expIn} 天后过期`}。任何人都可以通过它安装这个
              skill。
            </p>
            <div className="share-link">
              <code>{result.url}</code>
              <button className="btn-primary" onClick={copy}>
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <p className="muted-hint">
              短链 ID：<code>{result.id}</code>
            </p>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
