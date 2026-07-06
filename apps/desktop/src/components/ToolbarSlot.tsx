/**
 * 统一工具栏槽位（contextual toolbar via portal）
 *
 * 顶部 `TopBar` 始终在位，其右侧有一个固定的 DOM 槽位 `.toolbar-slot`。
 * 当前激活的视图把自己的工具栏控件（搜索/视图切换/重新扫描 等）通过
 * `createPortal` 注入到这个槽位里，从而实现「标签 + 视图控件在同一行」。
 *
 * - 切换标签时旧视图卸载，React 自动移除其 portal 内容，槽位随之清空
 *   （上下文相关：安装页不带这些控件）。
 * - host DOM 节点仅在 TopBar 挂载时 set 一次，不会有 setState 循环。
 *
 * TopBar 用 `useToolbarSlotHost()` 拿到 ref 回调挂在槽位 div 上；
 * 视图用 `useToolbarSlot()` 拿到当前 host 元素，再 `createPortal(node, host)`。
 */
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type RefCallback,
} from 'react';

const HostCtx = createContext<HTMLElement | null>(null);
const SetCtx = createContext<RefCallback<HTMLElement>>(() => {});

export function ToolbarSlotProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  return (
    <SetCtx.Provider value={setHost}>
      <HostCtx.Provider value={host}>{children}</HostCtx.Provider>
    </SetCtx.Provider>
  );
}

/** TopBar 槽位 div 的 ref 回调。 */
export function useToolbarSlotHost(): RefCallback<HTMLElement> {
  return useContext(SetCtx);
}

/** 视图侧：拿到当前槽位 host 元素（可能为 null，portal 前需判空）。 */
export function useToolbarSlot(): HTMLElement | null {
  return useContext(HostCtx);
}
