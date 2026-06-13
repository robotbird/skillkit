import { useState } from 'react';
import { ALL_TOOLS, TOOL_LABELS, type Tool } from '@shared/types';

interface Props {
  open: boolean;
  title?: string;
  subtitle?: string;
  defaultSelected?: Tool[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (targets: Tool[]) => void;
}

export default function ToolPicker({
  open,
  title = '安装到哪些工具？',
  subtitle = '至少选择一个工具，已选中的工具会各自得到一份 skill 副本。',
  defaultSelected = ['claude'],
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const [picked, setPicked] = useState<Tool[]>(defaultSelected);

  if (!open) return null;

  function toggle(t: Tool) {
    setPicked((arr) => (arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]));
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
          {ALL_TOOLS.map((t) => (
            <label key={t} className={picked.includes(t) ? 'checked' : ''}>
              <input
                type="checkbox"
                checked={picked.includes(t)}
                onChange={() => toggle(t)}
                disabled={busy}
              />
              <span>{TOOL_LABELS[t]}</span>
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            className="btn-primary"
            onClick={() => onConfirm(picked)}
            disabled={busy || picked.length === 0}
          >
            {busy ? <><span className="spinner" /> 安装中</> : '确认安装'}
          </button>
        </div>
      </div>
    </div>
  );
}
