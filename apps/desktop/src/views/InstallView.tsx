import { useState, useEffect, useRef, useMemo } from 'react';
import {
  TOOL_LABELS,
  type Tool,
  type InstallResult,
  type InstallOpts,
  type GithubSkillsResult,
  type RepoBatchResult,
  type ShareSourceInfo,
  type InstallRecord,
  type InstallRecordChannel,
  type InstallRecordStatus,
  type InstallErrorType,
} from '@shared/types';
import type { ToastState } from '../components/Toast';
import RepoSkillPicker from '../components/RepoSkillPicker';
import InstallToolGrid from '../components/InstallToolGrid';
import ModalPortal from '../components/ModalPortal';
import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/messages';
import { classifyInstallSource } from '../lib/install-source';
import { useLocalTools } from '../lib/useLocalTools';

// 安装记录字段 → i18n 键（状态/报错分类/渠道的小标签）
const RECORD_STATUS_KEY: Record<InstallRecordStatus, MessageKey> = {
  success: 'inst.records.status.success',
  partial: 'inst.records.status.partial',
  failed: 'inst.records.status.failed',
};
const RECORD_ERR_KEY: Record<InstallErrorType, MessageKey> = {
  network: 'inst.records.err.network',
  not_found: 'inst.records.err.not_found',
  filesystem: 'inst.records.err.filesystem',
  unknown: 'inst.records.err.unknown',
};
const RECORD_CHANNEL_KEY: Record<InstallRecordChannel, MessageKey> = {
  market: 'inst.records.channel.market',
  github: 'inst.records.channel.github',
  zip: 'inst.records.channel.zip',
  share: 'inst.records.channel.share',
  copy: 'inst.records.channel.copy',
  global: 'inst.records.channel.global',
};

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

function summarize(results: InstallResult[], t: T): string {
  const ok = results.filter((r) => r.ok).map((r) => TOOL_LABELS[r.tool]);
  const fail = results.filter((r) => !r.ok);
  const parts: string[] = [];
  if (ok.length) parts.push(t('inst.sum.installedTo', { tools: ok.join(', ') }));
  if (fail.length) parts.push(t('inst.sum.failed', { detail: fail.map((r) => `${TOOL_LABELS[r.tool]} (${r.error})`).join('; ') }));
  return parts.join('; ') || t('inst.sum.noTool');
}

/** 批量安装汇总：「已安装 N 个 skill 到 K 个工具：<名>…；失败：…」 */
function summarizeBatch(batch: RepoBatchResult[], t: T): string {
  const okSkills = batch.filter((b) => b.results.some((r) => r.ok)).map((b) => b.skillName);
  const failed = batch.flatMap((b) =>
    b.results.filter((r) => !r.ok).map((r) => `${b.skillName}->${TOOL_LABELS[r.tool]} (${r.error})`),
  );
  const parts: string[] = [];
  if (okSkills.length) {
    const tools = [...new Set(batch.flatMap((b) => b.results.filter((r) => r.ok).map((r) => r.tool)))];
    parts.push(t('inst.sumBatch.installed', { skills: okSkills.length, tools: tools.length, names: okSkills.join(', ') }));
  }
  if (failed.length) parts.push(t('inst.sumBatch.failed', { detail: failed.join('; ') }));
  return parts.join('; ') || t('inst.sumBatch.noSkill');
}

type InstallMode = 'link' | 'zip';

const MODE_LABELS: Record<InstallMode, MessageKey> = {
  link: 'inst.mode.link',
  zip: 'inst.mode.zip',
};

export default function InstallView({
  toast,
  onInstalled,
  pendingShare,
  onPendingConsumed,
}: {
  toast: ToastState;
  onInstalled: () => void;
  pendingShare?: string | null;
  onPendingConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<InstallMode>('link');
  const [linkUrl, setLinkUrl] = useState('');
  const [selectedTools, setSelectedTools] = useState<Tool[]>([]);
  // 本机已检测工具：空选安装时弹确认，确认后按「全部已检测工具」安装
  const { tools: localTools } = useLocalTools();
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  // 多 skill 仓库：listGithubSkills 的结果 + 弹窗开关
  const [repoPicker, setRepoPicker] = useState<{ open: boolean; result: GithubSkillsResult | null }>({
    open: false,
    result: null,
  });
  // zip：先选文件（存绝对路径），上传完成后再点「安装」选目标工具
  const [zipPath, setZipPath] = useState('');
  // 安装记录（持久化在主进程 DB）：挂载时读一次，每次安装完成（finally）后刷新
  const [records, setRecords] = useState<InstallRecord[]>([]);
  const [detailRecord, setDetailRecord] = useState<InstallRecord | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  // 链接 tab：实时识别输入是 skillkit.net 分享链接还是 GitHub，据此派生提示文案/颜色
  const detected = useMemo(() => classifyInstallSource(linkUrl), [linkUrl]);
  const linkHint = !linkUrl.trim()
    ? { msg: t('inst.hint.default'), cls: '' }
    : detected === 'share'
      ? { msg: t('inst.hint.detected.share'), cls: ' ok' }
      : detected === 'github'
        ? { msg: t('inst.hint.detected.github'), cls: ' ok' }
        : { msg: t('inst.hint.unknown'), cls: ' error' };

  // 深链预填用的 ref：规避 setState 异步竞态，确认安装时优先取它
  const pendingShareRef = useRef<string | null>(null);

  // 深链 -> App 传入输入：切到 link tab、预填输入框并直接安装。
  // 分享 id/share 链接走软链安装;GitHub 仓库地址(skill 详情页「从 Skillkit 安装」)走 GitHub 列举流程。
  useEffect(() => {
    if (!pendingShare) return;
    setMode('link');
    setLinkUrl(pendingShare);
    pendingShareRef.current = pendingShare;
    onPendingConsumed?.();
    // 直接安装到已选工具;空选则按全部已检测工具
    const targets = selectedTools.length ? selectedTools : localTools;
    if (targets.length === 0) {
      toast.show(t('inst.toast.needTools'), 'error');
      return;
    }
    if (classifyInstallSource(pendingShare.trim()) === 'github') {
      void startListGithub(targets);
      return;
    }
    void runInstall(targets, 'share');
    // selectedTools / localTools / t 有意不进 deps：仅在 pendingShare 到达时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShare, onPendingConsumed]);

  // 拉取安装记录（按时间倒序）。主进程在每次安装（含失败）后落库，故安装完成后刷新即可看到新行。
  async function loadRecords() {
    try {
      setRecords(await window.skillkit.getInstallRecords());
    } catch {
      /* ignore：记录列表失败不影响安装主流程 */
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  async function doClearRecords() {
    setClearOpen(false);
    try {
      await window.skillkit.clearInstallRecords();
      await loadRecords();
    } catch {
      /* ignore */
    }
  }

  // zip 第一步：弹系统文件框选 zip（仅选文件，不安装）；取消则保持原选择不变
  async function pickZipFile() {
    const p = await window.skillkit.pickZip();
    if (p) setZipPath(p);
  }

  // 点击「安装」：先做当前 tab 的输入校验 + 工具选择校验，通过后弹框选接入方式
  function startInstall() {
    if (mode === 'link' && !linkUrl.trim()) {
      toast.show(t('inst.toast.needLink'), 'error');
      return;
    }
    if (mode === 'zip' && !zipPath) {
      toast.show(t('inst.toast.needZip'), 'error');
      return;
    }
    if (selectedTools.length === 0) {
      // 空选：若本机一个已检测工具都没有才报错；否则弹确认「安装到全部已检测工具」
      if (localTools.length === 0) {
        toast.show(t('inst.toast.needTools'), 'error');
        return;
      }
      setConfirmAllOpen(true);
      return;
    }
    proceedInstall(selectedTools);
  }

  // 校验通过后的实际派发：分享/zip 直接软链安装；GitHub 先列举候选
  function proceedInstall(targets: Tool[]) {
    if (mode === 'link') {
      const kind = classifyInstallSource(linkUrl.trim());
      if (kind === 'unknown') {
        toast.show(t('inst.hint.unknown'), 'error');
        return;
      }
      if (kind === 'github') {
        void startListGithub(targets);
        return;
      }
      void runInstall(targets, 'share');
      return;
    }
    void runInstall(targets, 'zip');
  }

  // 空选确认：勾选全部已检测工具后照常派发（selectedTools 与各弹窗 fixedTargets 同步更新）
  function confirmInstallAll() {
    setConfirmAllOpen(false);
    setSelectedTools(localTools);
    proceedInstall(localTools);
  }

  // GitHub 列举仓库内 skill 候选：单 skill 直接软链安装；多 skill 弹 RepoSkillPicker 选哪些
  async function startListGithub(targets: Tool[]) {
    const url = (pendingShareRef.current ?? linkUrl).trim();
    if (!url) return;
    setBusy(true);
    let handedOff = false;
    try {
      const res = await window.skillkit.listGithubSkills(url);
      if (res.kind === 'single') {
        handedOff = true;
        void runInstall(targets, 'github-single'); // runInstall 自管 busy
        return;
      }
      if (res.skills.length === 0) {
        toast.show(
          res.isPlugin
            ? t('inst.toast.noSkillPlugin', { hints: res.pluginHints.join(', ') })
            : t('inst.toast.noSkill'),
          'error',
          5000,
        );
      } else {
        // 多 skill：弹 RepoSkillPicker（选哪些 skill，接入方式已固定软链）
        setRepoPicker({ open: true, result: res });
      }
    } catch (e: any) {
      toast.show(t('inst.toast.scanFail', { error: e?.message ?? e }), 'error');
    } finally {
      if (!handedOff) setBusy(false);
    }
  }

  // RepoSkillPicker 确认：批量安装选中的 skill 到页级已选工具
  async function handleRepoConfirm(pickedSubpaths: string[], targets: Tool[], opts: InstallOpts) {
    const result = repoPicker.result;
    if (!result) return;
    const url = linkUrl.trim();
    setBusy(true);
    try {
      const batch = await window.skillkit.installGithubSkillsAt(url, pickedSubpaths, targets, opts);
      const anyOk = batch.some((b) => b.results.some((r) => r.ok));
      toast.show(summarizeBatch(batch, t), anyOk ? 'info' : 'error', 5000);
      if (anyOk) {
        onInstalled();
      }
    } catch (e: any) {
      toast.show(t('inst.toast.installFail', { error: e?.message ?? e }), 'error');
    } finally {
      setBusy(false);
      setRepoPicker({ open: false, result: null });
      void loadRecords();
    }
  }

  // 真正执行安装：统一走软链（scope=global, method=symlink），不再弹接入方式选择框
  async function runInstall(
    targets: Tool[],
    kind: 'github-single' | 'share' | 'zip',
    opts: InstallOpts = { scope: 'global', method: 'symlink' },
  ) {
    setBusy(true);
    try {
      let results: InstallResult[] | null = null;

      if (kind === 'github-single') {
        // GitHub 单 skill 直装（多 skill 经 RepoSkillPicker 走 handleRepoConfirm）
        const url = (pendingShareRef.current ?? linkUrl).trim();
        pendingShareRef.current = null;
        results = await window.skillkit.installFromGithub(url, targets, opts);
        const okAny = results.some((r) => r.ok);
        toast.show(summarize(results, t), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          setLinkUrl('');
          onInstalled();
        }
      } else if (kind === 'share') {
        // 分享链接：链接型（GitHub 来源）其 /zip 会 404，改走 GitHub 安装；否则按 zip 安装。
        const url = (pendingShareRef.current ?? linkUrl).trim();
        pendingShareRef.current = null;
        try {
          const info: ShareSourceInfo = await window.skillkit.inspectShare(url);
          if (info.exists && info.meta.sourceUrl) {
            results = await window.skillkit.installFromGithub(info.meta.sourceUrl, targets, opts);
          }
        } catch {
          /* 忽略：回退到 zip 安装路径 */
        }
        if (!results) {
          results = await window.skillkit.installFromShare(url, targets, opts);
        }
        const okAny = results.some((r) => r.ok);
        toast.show(summarize(results, t), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          setLinkUrl('');
          onInstalled();
        }
      } else {
        // zip：用第一步选好的路径安装到所选工具
        results = await window.skillkit.installFromZip(zipPath, targets, opts);
        const okAny = results.some((x) => x.ok);
        toast.show(summarize(results, t), okAny ? 'info' : 'error', 4000);
        if (okAny) {
          setZipPath('');
          onInstalled();
        }
      }
    } catch (e: any) {
      toast.show(t('inst.toast.installFail', { error: e?.message ?? e }), 'error');
    } finally {
      setBusy(false);
      void loadRecords();
    }
  }

  const zipName = zipPath ? zipPath.split(/[\\/]/).pop() ?? '' : '';

  return (
    <section>
      <div className="tabs install-tabs">
        {(['link', 'zip'] as InstallMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            className={`tab${mode === m ? ' is-active' : ''}`}
            onClick={() => setMode(m)}
          >
            {t(MODE_LABELS[m])}
          </button>
        ))}
      </div>

      <div className="install-tools-block">
        <div className="install-tools-title">{t('inst.intro')}</div>
        <InstallToolGrid
          selected={selectedTools}
          onChange={setSelectedTools}
          disabled={busy}
        />
      </div>

      <div className="install-grid is-single">
        {mode === 'link' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/>
              </svg>
            </div>
            <h2 className="install-title">{t('inst.link.title')}</h2>
            <p className="install-desc">{t('inst.link.desc')}</p>
            <div className="install-input">
              <input
                placeholder={t('inst.link.placeholder')}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startInstall(); }}
              />
              <button className="btn-primary" onClick={startInstall} disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" />{' '}
                    {detected === 'github' ? t('inst.btn.scanning') : t('inst.btn.installing')}
                  </>
                ) : (
                  t('inst.btn.install')
                )}
              </button>
            </div>
            <div className={`install-hint${linkHint.cls}`}>{linkHint.msg}</div>
          </article>
        )}

        {mode === 'zip' && (
          <article className="install-card">
            <div className="install-icon">
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path fill="currentColor" d="M19 13v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5h2v5h10v-5h2zM12 3l5 5h-3v6h-4V8H7l5-5z"/>
              </svg>
            </div>
            <h2 className="install-title">{t('inst.zip.title')}</h2>
            <p className="install-desc">{t('inst.zip.desc')}</p>
            <div
              className={`dropzone${drag ? ' is-drag' : ''}`}
              onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer?.files?.[0];
                if (!f) return;
                const p = window.skillkit.getDroppedFilePath(f);
                if (!p.toLowerCase().endsWith('.zip')) {
                  toast.show(t('inst.toast.zipOnly'), 'error');
                  return;
                }
                setZipPath(p);
              }}
            >
              <div className="dropzone-inner">
                {zipPath ? (
                  <>
                    <svg viewBox="0 0 24 24" width="28" height="28" style={{ color: '#3ecf8e' }}>
                      <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <div className="dropzone-text">{t('inst.zip.uploaded')}</div>
                    <div className="dropzone-file">{zipName}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn-primary" onClick={startInstall} disabled={busy}>
                        {busy ? <><span className="spinner" /> {t('inst.btn.installing')}</> : t('inst.btn.install')}
                      </button>
                      <button className="btn-ghost" onClick={pickZipFile} disabled={busy}>
                        {t('inst.btn.resel')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="28" height="28">
                      <path fill="currentColor" d="M12 3l5 5h-3v6h-4V8H7l5-5zM5 18h14v2H5v-2z"/>
                    </svg>
                    <div className="dropzone-text">{t('inst.zip.dropzoneText')}</div>
                    <div className="dropzone-tip">{t('inst.zip.dropzoneTip')}</div>
                    <button className="btn-primary" onClick={pickZipFile} disabled={busy}>
                      {busy ? <><span className="spinner" /> {t('inst.btn.processing')}</> : t('inst.btn.chooseFile')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        )}
      </div>

      <section className="recent">
        <div className="recent-head">
          <h3>{t('inst.records.title')}</h3>
          {records.length > 0 && (
            <button className="btn-ghost record-clear" onClick={() => setClearOpen(true)} disabled={busy}>
              {t('inst.records.clear')}
            </button>
          )}
        </div>
        {records.length === 0 ? (
          <p className="recent-empty" style={{ margin: 0 }}>{t('inst.records.empty')}</p>
        ) : (
          <ul className="recent-list">
            {records.map((r) => (
              <li
                key={r.id}
                className="record-row"
                role="button"
                tabIndex={0}
                onClick={() => setDetailRecord(r)}
                onKeyDown={(e) => { if (e.key === 'Enter') setDetailRecord(r); }}
              >
                <span className={`record-status is-${r.status}`} title={t(RECORD_STATUS_KEY[r.status])} aria-hidden>●</span>
                <strong className="record-name">{r.skillName ?? r.label}</strong>
                <span className="record-channel">{t(RECORD_CHANNEL_KEY[r.channel])}</span>
                <span className="record-time">{new Date(r.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detailRecord && (
        <ModalPortal>
          <div
            className="modal-mask"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setDetailRecord(null); }}
          >
            <div className="modal log-modal" role="dialog" aria-modal="true">
              <h3>{t('inst.records.detailTitle')}</h3>
              <div className="log-modal-sub">
                <span className={`record-status is-${detailRecord.status}`} aria-hidden>●</span>
                <strong className="log-modal-title-name">{detailRecord.skillName ?? detailRecord.label}</strong>
                <span className="record-badge">{t(RECORD_STATUS_KEY[detailRecord.status])}</span>
                {detailRecord.errorType && (
                  <span className="record-badge record-badge-err">
                    {t(RECORD_ERR_KEY[detailRecord.errorType])}
                  </span>
                )}
                <span className="record-channel">{t(RECORD_CHANNEL_KEY[detailRecord.channel])}</span>
                <span className="record-time">{new Date(detailRecord.at).toLocaleString()}</span>
              </div>
              {detailRecord.label && <p className="modal-sub log-modal-label">{detailRecord.label}</p>}
              <div className="log-modal-body">
                {detailRecord.targets.length === 0 ? (
                  // 扫描阶段失败：没有 per-tool 明细，直接展示整体报错
                  detailRecord.error ? (
                    <p className="log-target-error log-scan-error">{detailRecord.error}</p>
                  ) : (
                    <p className="muted-hint">{t('inst.records.empty')}</p>
                  )
                ) : (
                  <ul className="log-modal-targets">
                    {detailRecord.targets.map((tg, i) => (
                      <li key={i} className={`log-target ${tg.ok ? 'is-ok' : 'is-fail'}`}>
                        <span className="log-target-mark">{tg.ok ? '✓' : '✗'}</span>
                        <span className="log-target-tool">{TOOL_LABELS[tg.tool]}</span>
                        {tg.ok ? (
                          <span className="log-target-detail" title={tg.path}>{tg.path}</span>
                        ) : (
                          <span className="log-target-detail log-target-error">{tg.error}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn-primary" onClick={() => setDetailRecord(null)}>
                  {t('inst.records.close')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {clearOpen && (
        <ModalPortal>
          <div
            className="modal-mask"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setClearOpen(false); }}
          >
            <div className="modal">
              <h3>{t('inst.records.clear')}</h3>
              <p className="modal-sub">{t('inst.records.clearConfirm')}</p>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setClearOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" onClick={doClearRecords}>
                  {t('inst.records.clear')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      <RepoSkillPicker
        open={repoPicker.open}
        result={repoPicker.result}
        busy={busy}
        fixedTargets={selectedTools}
        lockedScope="global"
        onCancel={() => !busy && setRepoPicker({ open: false, result: null })}
        onConfirm={handleRepoConfirm}
      />

      {confirmAllOpen && (
        <ModalPortal>
          <div
            className="modal-mask"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setConfirmAllOpen(false);
            }}
          >
            <div className="modal">
              <h3>{t('inst.confirmAllTitle')}</h3>
              <p className="modal-sub">{t('inst.confirmAllDesc', { count: localTools.length })}</p>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setConfirmAllOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" onClick={confirmInstallAll}>
                  {t('inst.confirmAllOk')}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </section>
  );
}
