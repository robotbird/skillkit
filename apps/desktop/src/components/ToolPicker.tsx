import { useEffect, useMemo, useState } from 'react';
import { ALL_TOOLS, type Tool, type InstallOpts } from '@shared/types';
import { useInstalledTools } from '../lib/useInstalledTools';
import ToolCheckRow from './ToolCheckRow';
import ModalPortal from './ModalPortal';

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
  /**
   * 安装场景：固定 scope='global'（skill 统一下载到全局仓库 ~/.agents/skills），
   * 并显示「接入方式（软链/拷贝）」选择。省略则不显示接入方式（卸载/复制/打开目录等场景）。
   */
  lockedScope?: 'global';
  busy?: boolean;
  confirmLabel?: string;
  busyLabel?: string;
  /** 确认按钮样式：danger 用于卸载等破坏性操作。 */
  tone?: 'primary' | 'danger';
  onCancel: () => void;
  /** 确认时一并回传安装范围/方式；忽略第二参的旧调用方仍合法（TS 允许少参数）。 */
  onConfirm: (targets: Tool[], opts: InstallOpts) => void;
}

export default function ToolPicker({
  open,
  title = '安装到哪些工具？',
  subtitle = '至少选择一个工具，已选中的工具会各自得到一份 skill 副本。',
  multiple = true,
  defaultSelected = [],
  excludeTools,
  disableTools,
  lockedScope,
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
  const [method, setMethod] = useState<'symlink' | 'copy'>('symlink');

  // 打开 / 切换源工具时重置已选项与接入方式
  const excludeKey = (excludeTools ?? []).join(',');
  const disableKey = (disableTools ?? []).join(',');
  useEffect(() => {
    if (open) {
      setPicked(initial);
      setMethod('symlink');
    }
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

  // 安装场景：固定全局仓库，显示接入方式选择。
  const showMethod = lockedScope === 'global';
  const scope: 'tools' | 'global' = lockedScope === 'global' ? 'global' : 'tools';

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <div className="modal">
          <h3>{title}</h3>
          <p className="modal-sub">{subtitle}</p>

          {showMethod && (
            <div className="opts opts-method">
              <div className="opts-section-title">安装方式</div>
              <label
                className={method === 'symlink' ? 'checked' : ''}
                title="单一数据源，改一处全更新；省空间"
              >
                <input
                  type="radio"
                  name="tp-method"
                  checked={method === 'symlink'}
                  onChange={() => setMethod('symlink')}
                />
                <strong>软链（推荐）</strong>
              </label>
              <label className={method === 'copy' ? 'checked' : ''} title="各工具独立副本，占用更多空间">
                <input
                  type="radio"
                  name="tp-method"
                  checked={method === 'copy'}
                  onChange={() => setMethod('copy')}
                />
                <strong>拷贝</strong>
              </label>
            </div>
          )}

          <div className="opts opts-tools">
            {visibleTools.map((t) => {
              const disabled = disabledSet.has(t);
              return (
                <ToolCheckRow
                  key={t}
                  tool={t}
                  checked={picked.includes(t)}
                  multiple={multiple}
                  disabled={disabled}
                  note={disabled ? '内置·不可卸载' : undefined}
                  parentBusy={busy}
                  onToggle={toggle}
                />
              );
            })}
          </div>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={onCancel} disabled={busy}>
              取消
            </button>
            <button
              className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
              onClick={() => onConfirm(picked, { scope, method })}
              disabled={busy || picked.length === 0}
            >
              {busy ? <><span className="spinner" /> {busyLabel}</> : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
