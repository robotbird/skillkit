import { ALL_TOOLS, TOOL_LABELS, type Tool } from '@shared/types';
import { TOOL_ICON } from '../lib/toolIcons';

interface Props {
  selected: Tool[];
  onChange: (tools: Tool[]) => void;
  disabled?: boolean;
}

/**
 * 安装页页级工具多选网格：全部 ALL_TOOLS，logo 在上、名称在下。
 * 不按本机是否已安装过滤。
 */
export default function InstallToolGrid({ selected, onChange, disabled = false }: Props) {
  const selectedSet = new Set(selected);

  function toggle(tool: Tool) {
    if (disabled) return;
    if (selectedSet.has(tool)) {
      onChange(selected.filter((t) => t !== tool));
    } else {
      onChange([...selected, tool]);
    }
  }

  return (
    <div className="install-tool-grid" role="group" aria-label="tools">
      {ALL_TOOLS.map((tool) => {
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
