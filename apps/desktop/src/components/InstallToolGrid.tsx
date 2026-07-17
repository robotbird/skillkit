import { TOOL_LABELS, type Tool } from '@skillkit/types';
import { TOOL_ICON } from '../lib/toolIcons';
import { useLocalTools } from '../lib/useLocalTools';
import { useI18n } from '../i18n';

interface Props {
  selected: Tool[];
  onChange: (tools: Tool[]) => void;
  disabled?: boolean;
}

/**
 * 安装页页级工具多选网格：只展示本机真身探测命中的工具（app 包或 cli 可执行）。
 * 不做目录兜底、空时不回退全部--探测不到就是空（宁缺毋滥）。
 */
export default function InstallToolGrid({ selected, onChange, disabled = false }: Props) {
  const { t } = useI18n();
  const { tools: local, ready } = useLocalTools();
  const selectedSet = new Set(selected);

  function toggle(tool: Tool) {
    if (disabled) return;
    if (selectedSet.has(tool)) {
      onChange(selected.filter((t) => t !== tool));
    } else {
      onChange([...selected, tool]);
    }
  }

  // 一个都没探测到：空状态提示，不回退展示全部
  if (ready && local.length === 0) {
    return (
      <div className="install-tool-grid" role="group" aria-label="tools">
        <p className="install-tool-empty" style={{ color: 'var(--ink-mute)', fontSize: 13, margin: 0 }}>
          {t('inst.noTools')}
        </p>
      </div>
    );
  }

  return (
    <div className="install-tool-grid" role="group" aria-label="tools">
      {local.map((tool) => {
        const isSelected = selectedSet.has(tool);
        return (
          <button
            key={tool}
            type="button"
            className={`install-tool-item${isSelected ? ' is-selected' : ''}`}
            aria-pressed={isSelected}
            disabled={disabled}
            title={TOOL_LABELS[tool]}
            onClick={() => toggle(tool)}
          >
            <img
              className="install-tool-ico"
              src={TOOL_ICON[tool]}
              alt=""
              width={32}
              height={32}
              draggable={false}
            />
            <span className="install-tool-name">{TOOL_LABELS[tool]}</span>
          </button>
        );
      })}
    </div>
  );
}
