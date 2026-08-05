import { useEffect, useMemo, useState } from 'react';
import {
  ALL_TOOLS,
  CUSTOM_TOOL_PREFIX,
  TOOL_LABELS,
  type Tool,
  type BuiltinTool,
  type CustomTool,
} from '@shared/types';
import { TOOL_ICON } from './toolIcons';

/**
 * 自定义 agent 运行期目录：把 DB 里的自定义 agent 合并进内置 ALL_TOOLS / TOOL_LABELS / TOOL_ICON，
 * 使渲染层各处（chip / 选择器 / 卡片 / toast）能透明展示自定义 agent。
 *
 * 设计：
 * - 模块级缓存 customs + 监听者集合；app 启动即预热拉取一次。
 * - `useToolCatalog()` 订阅变更并 force re-render（自定义 agent 增删后由设置面板 invalidate）。
 * - `toolLabel` / `toolIcon` 为模块级纯函数，供非组件（如 toast 文案 helper）直接调用，
 *   与 hook 内的同名函数读同一份缓存，结果一致。
 */

let customs: CustomTool[] = [];
let loaded = false;
let pend: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version++;
  listeners.forEach((l) => l());
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!pend) {
    pend = (async () => {
      try {
        customs = (await window.skillkit.listCustomTools()) ?? [];
      } catch {
        customs = [];
      }
      loaded = true;
      emit();
    })();
  }
  return pend;
}

// 预热：import 本模块即拉取，等用户进任意视图时通常已就绪。
void ensureLoaded();

/** 强制重新拉取（设置面板增删自定义 agent 后调用）。 */
export function invalidateCustomTools(): void {
  loaded = false;
  pend = null;
  void ensureLoaded();
}

/** 自定义 agent 图标：首字母圆形 SVG（data URI），按 label 取首字符；缓存避免重复编码。 */
const iconCache = new Map<string, string>();
function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => (({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string),
  );
}
function customIcon(label: string): string {
  const key = label || '?';
  const cached = iconCache.get(key);
  if (cached) return cached;
  const ch = escapeXml((key.trim()[0] || '?').toUpperCase());
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="8" fill="#71717a"/><text x="16" y="21" ` +
    `font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="15" font-weight="600" ` +
    `fill="#fff" text-anchor="middle">${ch}</text></svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  iconCache.set(key, uri);
  return uri;
}

/** 工具展示名：自定义 agent 取用户起的 label，否则内置 TOOL_LABELS，再兜底原 id。 */
export function toolLabel(tool: Tool): string {
  if (typeof tool === 'string' && tool.startsWith(CUSTOM_TOOL_PREFIX)) {
    return customs.find((c) => c.id === tool)?.label ?? tool;
  }
  return TOOL_LABELS[tool as BuiltinTool] ?? tool;
}

/** 工具图标：自定义 agent 用首字母兜底图，否则内置 TOOL_ICON。 */
export function toolIcon(tool: Tool): string {
  if (typeof tool === 'string' && tool.startsWith(CUSTOM_TOOL_PREFIX)) {
    const c = customs.find((x) => x.id === tool);
    return customIcon(c?.label ?? '?');
  }
  return TOOL_ICON[tool as BuiltinTool] ?? customIcon('?');
}

/** 全部工具 id（内置闭集 + 自定义），按内置顺序在前、自定义在后。 */
export function allToolsList(): Tool[] {
  return [...ALL_TOOLS, ...customs.map((c) => c.id)];
}

/** 订阅自定义 agent 变化并触发 re-render；首次挂载即拉取。 */
export function useCustomTools(): { customs: CustomTool[]; loaded: boolean; refresh: () => void } {
  const [, setV] = useState(version);
  useEffect(() => {
    const cb = () => setV(version);
    listeners.add(cb);
    void ensureLoaded();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return { customs, loaded, refresh: invalidateCustomTools };
}

/**
 * 合并目录：allTools（有序 id 列表）+ label/icon 解析函数。
 * 组件渲染（chip / 选择器 / 卡片）统一用它，取代裸 ALL_TOOLS / TOOL_LABELS / TOOL_ICON。
 */
export function useToolCatalog(): {
  customs: CustomTool[];
  allTools: Tool[];
  label: (t: Tool) => string;
  icon: (t: Tool) => string;
} {
  const { customs } = useCustomTools();
  // allTools 仅在 customs 变化时重建，保持引用稳定，可安全用作下游 useMemo 依赖。
  const allTools = useMemo(() => [...ALL_TOOLS, ...customs.map((c) => c.id)], [customs]);
  return {
    customs,
    allTools,
    label: toolLabel,
    icon: toolIcon,
  };
}
