import { useEffect, useState } from 'react';
import { type Tool, type GithubSkillsResult } from '@shared/types';
import { useInstalledTools } from '../lib/useInstalledTools';
import ToolCheckRow, { visibleToolsOf } from './ToolCheckRow';

interface Props {
  open: boolean;
  result: GithubSkillsResult | null; // 来自 listGithubSkills
  busy: boolean;
  onCancel: () => void;
  onConfirm: (pickedSubpaths: string[], targets: Tool[]) => void;
}

/**
 * 多 skill 仓库的批量安装弹窗：复用 ToolPicker 的 modal 骨架与 CSS。
 * 同一弹窗两区域：上栏 skill 候选多选（默认全选，含全选/全不选），
 * 下栏目标工具多选。一次确认即批量安装 N 个 skill 到 K 个工具。
 */
export default function RepoSkillPicker({ open, result, busy, onCancel, onConfirm }: Props) {
  const { tools: installed } = useInstalledTools();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Tool[]>(['claude']);

  // 结果变化时默认全选所有候选；目标工具默认取 claude（若已安装）
  useEffect(() => {
    if (!open || !result) return;
    setPicked(new Set(result.skills.map((s) => s.subpath)));
    setTargets(['claude']);
  }, [open, result]);

  if (!open || !result) return null;

  const visibleTools = visibleToolsOf(installed);
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

  function toggleTarget(t: Tool) {
    setTargets((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));
  }

  const confirmLabel = busy
    ? '安装中…'
    : `安装 ${picked.size} 个 skill 到 ${targets.length} 个工具`;
  const confirmDisabled = busy || picked.size === 0 || targets.length === 0;

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal repo-skill-modal">
        <div className="repo-skill-head">
          <h3>从 GitHub 仓库选择要安装的 Skill</h3>
          <p className="modal-sub">
            扫描到 {result.skills.length} 个 skill 候选 · {result.repo}
          </p>
        </div>

        <div className="repo-skill-scroll">
          {result.skills.length === 0 ? (
            <div className="repo-skill-empty">
              未扫到任何带有效 frontmatter 的 SKILL.md / AGENTS.md。
            </div>
          ) : (
            <div className="opts opts-skills">
              <label className={`opts-skills-all${allChecked ? ' checked' : ''}`}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} disabled={busy} />
                <strong>{allChecked ? '全不选' : '全选'}</strong>
                <span className="opt-note">{picked.size}/{result.skills.length}</span>
              </label>
              <hr />
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
                    <code className="skill-subpath">{s.subpath || '(仓库根)'}</code>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="repo-skill-foot">
          {result.skills.length > 0 && (
            <>
              <div className="opts-section-title">安装到哪些工具？</div>
              <div className="opts opts-tools">
                {visibleTools.map((t) => (
                  <ToolCheckRow
                    key={t}
                    tool={t}
                    checked={targets.includes(t)}
                    parentBusy={busy}
                    onToggle={toggleTarget}
                  />
                ))}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn-ghost" onClick={onCancel} disabled={busy}>
              取消
            </button>
            <button
              className="btn-primary"
              onClick={() => onConfirm([...picked], targets)}
              disabled={confirmDisabled}
            >
              {busy && <span className="spinner" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
