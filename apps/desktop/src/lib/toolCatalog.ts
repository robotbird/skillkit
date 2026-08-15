import { useEffect, useMemo, useState } from 'react';
import {
  ALL_TOOLS,
  CUSTOM_TOOL_PREFIX,
  GLOBAL_TOOL,
  TOOL_LABELS,
  type Tool,
  type BuiltinTool,
  type CustomTool,
} from '@shared/types';
import { TOOL_ICON, GLOBAL_ICON } from './toolIcons';

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

/**
 * 按名称推荐品牌图标：label 含某品牌关键词（含中文/别名）→ 对应 BuiltinTool；无命中 null。
 * 用于新建自定义 Agent / 项目时的「默认推荐分配」（选择器里高亮该项）。
 * ASCII 词按词边界匹配（避免 'pi' 命中 'pipeline'/'api'）；含非 ASCII（中文）的词用子串。
 */
const ICON_KEYWORDS: { key: BuiltinTool; words: string[] }[] = [
  { key: 'claude', words: ['claude', 'claude code', 'claude-code', 'sonnet', 'opus', 'haiku', 'anthropic', '克劳德'] },
  { key: 'codex', words: ['codex', 'openai', 'chatgpt', 'gpt'] },
  { key: 'cursor', words: ['cursor', '光标'] },
  { key: 'trae', words: ['trae'] },
  { key: 'qoder', words: ['qoder'] },
  { key: 'grok', words: ['grok'] },
  { key: 'opencode', words: ['opencode'] },
  { key: 'gemini', words: ['gemini', 'bard'] },
  { key: 'antigravity', words: ['antigravity'] },
  { key: 'windsurf', words: ['windsurf', 'codeium'] },
  { key: 'augment', words: ['augment'] },
  { key: 'codebuddy', words: ['codebuddy', 'code buddy'] },
  { key: 'pi', words: ['pi'] },
  { key: 'kiro', words: ['kiro'] },
  { key: 'hermes', words: ['hermes', '赫尔墨斯'] },
  { key: 'openclaw', words: ['openclaw', 'clawdbot', 'moltbot'] },
  { key: 'cline', words: ['cline'] },
  { key: 'warp', words: ['warp'] },
  { key: 'kimi', words: ['kimi'] },
  { key: 'workbuddy', words: ['workbuddy', 'work buddy'] },
];

function labelHasWord(labelLc: string, word: string): boolean {
  const w = word.toLowerCase();
  if (/[^\x00-\x7f]/.test(w)) return labelLc.includes(w); // 中文等：直接子串
  // ASCII：词边界，防止 'pi' 命中 'pipeline' / 'api' 等
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(labelLc);
}

export function recommendIcon(label: string): BuiltinTool | null {
  const lc = (label || '').toLowerCase();
  if (!lc.trim()) return null;
  for (const { key, words } of ICON_KEYWORDS) {
    if (words.some((wd) => labelHasWord(lc, wd))) return key;
  }
  return null;
}

/** 工具展示名：自定义 agent 取用户起的 label，否则内置 TOOL_LABELS，再兜底原 id。 */
export function toolLabel(tool: Tool): string {
  if (tool === GLOBAL_TOOL) return '全局仓库';
  if (typeof tool === 'string' && tool.startsWith(CUSTOM_TOOL_PREFIX)) {
    return customs.find((c) => c.id === tool)?.label ?? tool;
  }
  return TOOL_LABELS[tool as BuiltinTool] ?? tool;
}

/** 工具图标：自定义 agent/项目优先用上传图片，其次品牌图标，最后首字母兜底；内置用 TOOL_ICON。 */
export function toolIcon(tool: Tool): string {
  if (tool === GLOBAL_TOOL) return GLOBAL_ICON;
  if (typeof tool === 'string' && tool.startsWith(CUSTOM_TOOL_PREFIX)) {
    const c = customs.find((x) => x.id === tool);
    if (c?.iconImage) return c.iconImage;
    if (c?.icon) return TOOL_ICON[c.icon];
    return customIcon(c?.label ?? '?');
  }
  return TOOL_ICON[tool as BuiltinTool] ?? customIcon('?');
}

// ===== 图标选择器取值模型 =====
// 把持久化在 CustomTool 里的两个图标字段（品牌 key icon / 上传图片 iconImage）归一成
// 选择器的单一取值；三选一互斥：上传图片 > 品牌图标 > 自动（首字母）。
export type IconSelection =
  | { t: 'auto' }
  | { t: 'brand'; key: BuiltinTool }
  | { t: 'image'; src: string };

/** 从持久化的 CustomTool 推出当前选择（按 image > brand > auto 优先级）。 */
export function customToolIconSelection(c: CustomTool): IconSelection {
  if (c.iconImage) return { t: 'image', src: c.iconImage };
  if (c.icon) return { t: 'brand', key: c.icon };
  return { t: 'auto' };
}

/** 选择器取值 → 写库 patch（互斥：选其一、清其余），供 addCustomTool/updateCustomTool 用。 */
export function selectionToPatch(sel: IconSelection): {
  icon: BuiltinTool | null;
  iconImage: string | null;
} {
  if (sel.t === 'brand') return { icon: sel.key, iconImage: null };
  if (sel.t === 'image') return { icon: null, iconImage: sel.src };
  return { icon: null, iconImage: null };
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
