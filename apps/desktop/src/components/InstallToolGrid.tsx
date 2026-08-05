import { type Tool } from '@skillkit/types';
import { useLocalTools } from '../lib/useLocalTools';
import { useToolCatalog } from '../lib/toolCatalog';

interface Props {
  selected: Tool[];
  onChange: (tools: Tool[]) => void;
  disabled?: boolean;
}

/**
 * 安装页页级工具多选网格：默认只展示本机真身探测命中的工具（含自定义 agent）；
 * 一个都没探测到时回退展示全部（避免空白网格）。
 */
export default function InstallToolGrid({ selected, onChange, disabled = false }: Props) {
  const { tools: local, ready } = useLocalTools();
  const { allTools, label, icon } = useToolCatalog();
  const selectedSet = new Set(selected);
  // 默认只列本机已检测工具；探测为空时回退全部（含自定义）
  const visible = ready ? (local.length ? local : allTools) : [];

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
      {visible.map((tool) => {
        const isSelected = selectedSet.has(tool);
        return (
          <button
            key={tool}
            type="button"
            className={`install-tool-item${isSelected ? ' is-selected' : ''}`}
            aria-pressed={isSelected}
            disabled={disabled}
            title={label(tool)}
            onClick={() => toggle(tool)}
          >
            <img
              className="install-tool-ico"
              src={icon(tool)}
              alt=""
              width={32}
              height={32}
              draggable={false}
            />
            <span className="install-tool-name">{label(tool)}</span>
          </button>
        );
      })}
    </div>
  );
}
