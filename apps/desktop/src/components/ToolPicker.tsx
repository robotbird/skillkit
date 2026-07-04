import { useEffect, useMemo, useState } from 'react';
import { ALL_TOOLS, TOOL_LABELS, type Tool } from '@shared/types';
import { useInstalledTools } from '../lib/useInstalledTools';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';
import workbuddyIcon from '../assets/agents/workbuddy.svg';

const TOOL_ICON: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
  workbuddy: workbuddyIcon,
};

interface Props {
  open: boolean;
  title?: string;
  subtitle?: string;
  /**
   * 选择模式：默认 true 多选（checkbox，用于安装/复制/卸载）；
   * false 单选（radio，用于「打开目录」——一个 skill 装在多个工具下时选一个）。
   */
  multiple?: boolean;
  defaultSelected?: Tool[];
  /** 完全隐藏的工具（不在列表里出现）。 */
  excludeTools?: Tool[];
  /** 显示但置灰、不可勾选的工具（如内置不可卸载）。 */
  disableTools?: Tool[];
  busy?: boolean;
  confirmLabel?: string;
  busyLabel?: string;
  /** 确认按钮样式：danger 用于卸载等破坏性操作。 */
  tone?: 'primary' | 'danger';
  onCancel: () => void;
  onConfirm: (targets: Tool[]) => void;
}

export default function ToolPicker({
  open,
  title = '安装到哪些工具？',
  subtitle = '至少选择一个工具，已选中的工具会各自得到一份 skill 副本。',
  multiple = true,
  defaultSelected = ['claude'],
  excludeTools,
  disableTools,
  busy,
  confirmLabel = '确认安装',
  busyLabel = '安装中',
  tone = 'primary',
  onCancel,
  onConfirm,
}: Props) {
  // 只展示「已安装」工具(其 ~/.<tool> 根目录存在),未安装工具既不显示也不可选。
  const { tools: installed } = useInstalledTools();
  const availableSet = useMemo(() => new Set(installed), [installed]);

  const visibleTools = useMemo(
    () => ALL_TOOLS.filter((t) => !excludeTools?.includes(t) && availableSet.has(t)),
    [excludeTools, availableSet],
  );
  const disabledSet = useMemo(() => new Set(disableTools ?? []), [disableTools]);
  const initial = useMemo(
    () =>
      defaultSelected.filter(
        (t) => !excludeTools?.includes(t) && !disabledSet.has(t) && availableSet.has(t),
      ),
    [defaultSelected, excludeTools, disabledSet, availableSet],
  );
  const [picked, setPicked] = useState<Tool[]>(initial);

  // 打开 / 切换源工具时重置已选项
  const excludeKey = (excludeTools ?? []).join(',');
  const disableKey = (disableTools ?? []).join(',');
  useEffect(() => {
    if (open) setPicked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, excludeKey, disableKey]);

  if (!open) return null;

  function toggle(t: Tool) {
    if (disabledSet.has(t)) return;
    if (multiple) {
      setPicked((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));
    } else {
      // 单选：直接替换（radio 语义，点了即唯一选中）
      setPicked([t]);
    }
  }

  return (
    <div
      className="modal-mask"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal">
        <h3>{title}</h3>
        <p className="modal-sub">{subtitle}</p>
        <div className="opts">
          {visibleTools.map((t) => {
            const disabled = disabledSet.has(t);
            return (
              <label
                key={t}
                className={`${picked.includes(t) ? 'checked' : ''}${disabled ? ' is-disabled' : ''}`}
              >
                <input
                  type={multiple ? 'checkbox' : 'radio'}
                  name={multiple ? undefined : 'tool-picker'}
                  checked={picked.includes(t)}
                  onChange={() => toggle(t)}
                  disabled={busy || disabled}
                />
                <img className="opt-ico" src={TOOL_ICON[t]} alt="" draggable={false} />
                <span>{TOOL_LABELS[t]}</span>
                {disabled && <span className="opt-note">内置·不可卸载</span>}
              </label>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={() => onConfirm(picked)}
            disabled={busy || picked.length === 0}
          >
            {busy ? <><span className="spinner" /> {busyLabel}</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
