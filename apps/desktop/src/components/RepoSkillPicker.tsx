import { useEffect, useState } from 'react';
import { type Tool, type GithubSkillsResult, type InstallOpts } from '@shared/types';
import { useInstalledTools } from '../lib/useInstalledTools';
import ToolCheckRow, { visibleToolsOf } from './ToolCheckRow';
import ModalPortal from './ModalPortal';
import { useI18n } from '../i18n';

interface Props {
  open: boolean;
  result: GithubSkillsResult | null; // 来自 listGithubSkills
  busy: boolean;
  /** 安装场景：固定 scope='global'，显示「接入方式（软链/拷贝）」选择。 */
  lockedScope?: 'global';
  onCancel: () => void;
  onConfirm: (pickedSubpaths: string[], targets: Tool[], opts: InstallOpts) => void;
}

/**
 * 多 skill 仓库的批量安装弹窗：复用 ToolPicker 的 modal 骨架与 CSS。
 * 同一弹窗两区域：上栏 skill 候选多选（默认全选，含全选/全不选），
   * 下栏接入方式（软链/拷贝）+ 目标工具多选。一次确认即批量安装 N 个 skill 到 K 个工具。
 */
export default function RepoSkillPicker({
  open,
  result,
  busy,
  lockedScope,
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const { tools: installed } = useInstalledTools();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Tool[]>([]);
  const [method, setMethod] = useState<'symlink' | 'copy'>('symlink');

  // 结果变化时默认全选所有候选；目标工具默认取 claude（若已安装）；接入方式默认软链
  useEffect(() => {
    if (!open || !result) return;
    setPicked(new Set(result.skills.map((s) => s.subpath)));
    setTargets([]);
    setMethod('symlink');
  }, [open, result]);

  // Esc 关闭（busy 进行中不响应）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open || !result) return null;

  const visibleTools = visibleToolsOf(installed);
  const showMethod = lockedScope === 'global';
  const scope: 'tools' | 'global' = lockedScope === 'global' ? 'global' : 'tools';
  const allChecked = result.skills.length > 0 && picked.size === result.skills.length;

  function toggleSkill(subpath: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(subpath)) next.delete(subpath);
      else next.add(subpath);
      return next;
    });
  }

  function toggleAll() {
    const skills = result?.skills ?? [];
    setPicked((prev) => {
      if (prev.size === skills.length) return new Set();
      return new Set(skills.map((s) => s.subpath));
    });
  }

  function toggleTarget(tool: Tool) {
    setTargets((arr) => (arr.includes(tool) ? arr.filter((x) => x !== tool) : [...arr, tool]));
  }

  const confirmLabel = busy
    ? t('reposkill.busy')
    : t('reposkill.confirm', { picked: picked.size, targets: targets.length });
  const confirmDisabled = busy || picked.size === 0 || targets.length === 0;

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <div className="modal repo-skill-modal">
          <div className="repo-skill-head">
            <h3>{t('reposkill.title')}</h3>
            <p className="modal-sub">
              {t('reposkill.scanned', { count: result.skills.length, repo: result.repo })}
            </p>
          </div>

          <div className="repo-skill-scroll">
            {result.skills.length === 0 ? (
              <div className="repo-skill-empty">{t('reposkill.empty')}</div>
            ) : (
              <div className="opts opts-skills">
                {result.skills.length > 1 && (
                  <>
                    <label className={`opts-skills-all${allChecked ? ' checked' : ''}`}>
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={busy} />
                      <strong>{allChecked ? t('reposkill.selectNone') : t('reposkill.selectAll')}</strong>
                      <span className="opt-note">{picked.size}/{result.skills.length}</span>
                    </label>
                    <hr />
                  </>
                )}
                {result.skills.map((s) => (
                  <label key={s.subpath} className={picked.has(s.subpath) ? 'checked' : ''}>
                    <input
                      type="checkbox"
                      checked={picked.has(s.subpath)}
                      onChange={() => toggleSkill(s.subpath)}
                      disabled={busy}
                    />
                    <div className="skill-row">
                      <strong>{s.name}</strong>
                      {s.description && <span className="opt-note">{s.description}</span>}
                      <code className="skill-subpath">{s.subpath || t('reposkill.repoRoot')}</code>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="repo-skill-foot">
            {result.skills.length > 0 && (
              <>
                {showMethod && (
                  <div className="opts opts-method">
                    <div className="opts-section-title">{t('install.method')}</div>
                    <label className={method === 'symlink' ? 'checked' : ''} title={t('install.symlinkDesc')}>
                      <input
                        type="radio"
                        name="rp-method"
                        checked={method === 'symlink'}
                        onChange={() => setMethod('symlink')}
                      />
                      <strong>{t('install.symlink')}</strong>
                    </label>
                    <label className={method === 'copy' ? 'checked' : ''} title={t('install.copyDesc')}>
                      <input
                        type="radio"
                        name="rp-method"
                        checked={method === 'copy'}
                        onChange={() => setMethod('copy')}
                      />
                      <strong>{t('install.copy')}</strong>
                    </label>
                  </div>
                )}

                <div className="opts-section-title">{t('toolpicker.title')}</div>
                <div className="opts opts-tools">
                  {visibleTools.map((tool) => (
                    <ToolCheckRow
                      key={tool}
                      tool={tool}
                      checked={targets.includes(tool)}
                      parentBusy={busy}
                      onToggle={toggleTarget}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn-ghost" onClick={onCancel} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={() => onConfirm([...picked], targets, { scope, method })}
                disabled={confirmDisabled}
              >
                {busy && <span className="spinner" />}
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
