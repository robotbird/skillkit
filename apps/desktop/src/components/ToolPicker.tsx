import { useEffect, useMemo, useState } from 'react';
import { ALL_TOOLS, type Tool, type InstallOpts } from '@shared/types';
import { useInstalledTools } from '../lib/useInstalledTools';
import ToolCheckRow from './ToolCheckRow';
import ModalPortal from './ModalPortal';
import { useI18n } from '../i18n';

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
   * 展示全部 ALL_TOOLS（仅按 excludeTools 过滤），不按本机是否已安装过滤。
   * 用于「复制到其他工具」，与安装页 InstallToolGrid 行为一致——允许复制到
   * 尚未在本机出现的工具（目标 installRoot 会自动 mkdir -p）。
   */
  allTools?: boolean;
  /**
   * 若传入：隐藏弹窗内工具列表，确认时直接使用该列表作为 targets。
   * 用于安装页已在页级完成工具多选的场景。
   */
  fixedTargets?: Tool[];
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
  title,
  subtitle,
  multiple = true,
  defaultSelected = [],
  excludeTools,
  disableTools,
  allTools,
  fixedTargets,
  lockedScope,
  busy,
  confirmLabel,
  busyLabel,
  tone = 'primary',
  onCancel,
  onConfirm,
}: Props) {
  const { t } = useI18n();
  const hideTools = fixedTargets != null;
  const titleText = title ?? t('toolpicker.title');
  const subtitleText = subtitle ?? t('toolpicker.subtitle');
  const confirmText = confirmLabel ?? t('toolpicker.confirm');
  const busyText = busyLabel ?? t('toolpicker.busy');

  // 默认只展示「已安装」工具(其 ~/.<tool> 根目录存在)，未安装工具既不显示也不可选。
  // allTools=true 时改为展示全部 ALL_TOOLS（仅按 excludeTools 过滤），与安装页一致。
  // fixedTargets 场景不需要本机探测列表。
  const { tools: installed } = useInstalledTools();
  const availableSet = useMemo(() => new Set(installed), [installed]);

  const visibleTools = useMemo(
    () =>
      ALL_TOOLS.filter((tool) => {
        if (excludeTools?.includes(tool)) return false;
        return allTools || availableSet.has(tool);
      }),
    [excludeTools, availableSet, allTools],
  );
  const disabledSet = useMemo(() => new Set(disableTools ?? []), [disableTools]);
  const initial = useMemo(
    () =>
      defaultSelected.filter((tool) => {
        if (excludeTools?.includes(tool)) return false;
        if (disabledSet.has(tool)) return false;
        return allTools || availableSet.has(tool);
      }),
    [defaultSelected, excludeTools, disabledSet, availableSet, allTools],
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

  // Esc 关闭（busy 进行中不响应）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  function toggle(tool: Tool) {
    if (disabledSet.has(tool)) return;
    if (multiple) {
      setPicked((arr) => (arr.includes(tool) ? arr.filter((x) => x !== tool) : [...arr, tool]));
    } else {
      // 单选：直接替换（radio 语义，点了即唯一选中）
      setPicked([tool]);
    }
  }

  // 安装场景：固定全局仓库，显示接入方式选择。
  const showMethod = lockedScope === 'global';
  const scope: 'tools' | 'global' = lockedScope === 'global' ? 'global' : 'tools';
  const confirmTargets = hideTools ? fixedTargets! : picked;
  const confirmDisabled = !!busy || confirmTargets.length === 0;

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <div className="modal">
          <h3>{titleText}</h3>
          <p className="modal-sub">{subtitleText}</p>

          {showMethod && (
            <div className="opts opts-method">
              <div className="opts-section-title">{t('install.method')}</div>
              <label
                className={method === 'symlink' ? 'checked' : ''}
                title={t('install.symlinkDesc')}
              >
                <input
                  type="radio"
                  name="tp-method"
                  checked={method === 'symlink'}
                  onChange={() => setMethod('symlink')}
                />
                <strong>{t('install.symlink')}</strong>
              </label>
              <label className={method === 'copy' ? 'checked' : ''} title={t('install.copyDesc')}>
                <input
                  type="radio"
                  name="tp-method"
                  checked={method === 'copy'}
                  onChange={() => setMethod('copy')}
                />
                <strong>{t('install.copy')}</strong>
              </label>
            </div>
          )}

          {!hideTools && (
            <div className="opts opts-tools">
              {visibleTools.map((tool) => {
                const rowDisabled = disabledSet.has(tool);
                return (
                  <ToolCheckRow
                    key={tool}
                    tool={tool}
                    checked={picked.includes(tool)}
                    multiple={multiple}
                    disabled={rowDisabled}
                    note={rowDisabled ? t('toolpicker.builtinNote') : undefined}
                    parentBusy={busy}
                    onToggle={toggle}
                  />
                );
              })}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={onCancel} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
              onClick={() => onConfirm(confirmTargets, { scope, method })}
              disabled={confirmDisabled}
            >
              {busy ? <><span className="spinner" /> {busyText}</> : confirmText}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
