import { TOOL_LABELS, type Tool } from '@shared/types';

export default function ToolBadge({ tool }: { tool: Tool }) {
  return (
    <span className={`tool-badge tool-${tool}`} title={TOOL_LABELS[tool]}>
      <span className="dot" />
      {TOOL_LABELS[tool]}
    </span>
  );
}
