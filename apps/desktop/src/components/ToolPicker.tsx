import { useEffect, useMemo, useState } from 'react';
import { GLOBAL_TOOL, type Tool, type InstallOpts } from '@shared/types';
import { useInstalledTools } from '../lib/useInstalledTools';
import { useLocalTools } from '../lib/useLocalTools';
import { useToolCatalog, useCustomTools } from '../lib/toolCatalog';
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
   * 安装目标场景（市场安装 / 复制到其他工具 / 全局仓「接入」）：与安装页
   * InstallToolGrid 同一规则——只列**真身探测**命中的工具（app 包/CLI + 自定义
   * agent），未装在本机的不可选；一个都没探测到时回退全部，保证「按本机是否
   * 已装筛选」全局一致。省略则按「本机有配置且有 skill」的旧口径过滤
   * （卸载/打开目录等针对本组工具的场景，残留 skill 也需可操作）。
   */
  installTargets?: boolean;
  /**
   * 若传入：隐藏弹窗内工具列表，确认时直接使用该列表作为 targets。
   * 用于安装页已在页级完成工具多选的场景。
   */
  fixedTargets?: Tool[];
  /**
   * 安装场景：固定 scope='global'（skill 统一下载到全局仓库 ~/.agents/skills）。
   * 接入方式不让用户选：与安装页 / 全局仓「接入」按钮同一行为，一律默认软链。
   */
  lockedScope?: 'global';
  /**
   * 配合 lockedScope='global'：列表首位展示「全局仓库」伪目标并默认勾选
   * （默认仅装到 ~/.agents/skills，另勾工具后再接入）。仅用于「从来源安装」的弹窗；
   * 「全局仓库 → 安装到工具」（skill 已在全局仓）不传，避免无意义的自指目标。
   */
  globalOption?: boolean;
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
  installTargets,
  fixedTargets,
  lockedScope,
  globalOption,
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

  // 工具可见性两套口径（全局一致的约定）：
  // - installTargets（安装/复制/接入目标）：真身探测（useLocalTools，app 包/CLI 命中 + 自定义
  //   agent），与安装页 InstallToolGrid 完全同一规则，包括「一个都没探测到 → 回退全部」；未装工具不可选。
  // - 默认（卸载/打开目录等本组操作）：本机有配置且有 skill（useInstalledTools），
  //   已卸载工具的残留 skill 也要能操作，故不用真身口径。
  // fixedTargets 场景不需要本机探测列表。
  const { tools: installed } = useInstalledTools();
  const { tools: local, ready: localReady } = useLocalTools();
  const { allTools: catalogTools } = useToolCatalog();
  const availableSet = useMemo(() => new Set(installed), [installed]);
  const targetSet = useMemo(() => new Set(local), [local]);
  // 真身探测一个都没命中（刚装机/探测失败）→ 回退展示全部，避免空列表死弹窗（与安装页一致）
  const targetAllowAll = installTargets && localReady && local.length === 0;
  const isSelectable = (tool: Tool) =>
    installTargets ? targetAllowAll || targetSet.has(tool) : availableSet.has(tool);

  // 「项目」类型是只读扫描来源（projectRoot 下多个 agent 子目录），不作安装/复制目标——选择器里隐藏。
  const { customs } = useCustomTools();
  const projectIds = useMemo(
    () => new Set(customs.filter((c) => c.kind === 'project').map((c) => c.id)),
    [customs],
  );

  const visibleTools = useMemo(
    () =>
      catalogTools.filter((tool) => {
        if (excludeTools?.includes(tool)) return false;
        if (projectIds.has(tool)) return false;
        return isSelectable(tool);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogTools, excludeTools, availableSet, targetSet, targetAllowAll, projectIds],
  );
  const disabledSet = useMemo(() => new Set(disableTools ?? []), [disableTools]);
  const initial = useMemo(
    () =>
      defaultSelected.filter((tool) => {
        if (excludeTools?.includes(tool)) return false;
        if (disabledSet.has(tool)) return false;
        if (projectIds.has(tool)) return false;
        return isSelectable(tool);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultSelected, excludeTools, disabledSet, availableSet, targetSet, targetAllowAll, projectIds],
  );
  // 安装场景（lockedScope='global' + globalOption）：列表首位固定「全局仓库」伪目标并默认勾选——
  // 默认只装到 ~/.agents/skills，用户另勾具体工具后再接入对应工具目录。
  const showGlobal = lockedScope === 'global' && globalOption === true;
  const initialWithGlobal = useMemo(
    () => (showGlobal ? [GLOBAL_TOOL, ...initial.filter((t) => t !== GLOBAL_TOOL)] : initial),
    [showGlobal, initial],
  );
  const [picked, setPicked] = useState<Tool[]>(initialWithGlobal);

  // 打开 / 切换源工具时重置已选项（接入方式固定软链，无需状态）
  const excludeKey = (excludeTools ?? []).join(',');
  const disableKey = (disableTools ?? []).join(',');
  useEffect(() => {
    if (open) {
      setPicked(initialWithGlobal);
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

  // 接入方式固定软链（与安装页 / 全局仓「接入」按钮同一行为），不让用户选。
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
          {showGlobal && <p className="modal-sub">{t('toolpicker.globalHint')}</p>}

          {!hideTools && (
            <div className="opts opts-tools">
              {(showGlobal ? [GLOBAL_TOOL, ...visibleTools] : visibleTools).map((tool) => {
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
              onClick={() => onConfirm(confirmTargets, { scope, method: 'symlink' })}
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
