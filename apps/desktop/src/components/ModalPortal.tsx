import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把弹窗/遮罩 portal 到 document.body，使其脱离 `<main>` 的层叠上下文。
 *
 * 根因：`<main>` 是 `position: relative; z-index: 1`，会建立一个层叠上下文，
 * 弹窗（`.modal-mask`，`position: fixed; z-index: 100`）作为 main 的后代被「困」在
 * 层级 1，永远低于顶栏 `.topbar`（层级 2）——于是遮罩盖不住顶栏。
 * portal 到 body 后，弹窗直接参与根层叠上下文，z-index:100 自然盖住一切。
 *
 * 附带：弹框 mount/unmount 时通知主进程伪装 Windows 原生标题栏 overlay（遮挡关闭/最大化区域）。
 * 原生 caption 是 OS 层绘制、压在 web 之上，mask 盖不住；详见 electron/theme.ts setModalChromeHidden。
 * 用模块级 openCount 计数支持嵌套弹框（如详情框叠在设置框上）：首个 mount 伪装、末个 unmount 恢复。
 * useEffect 置于早期 return 之前以遵守 hooks 规则。
 */
let openCount = 0;

export default function ModalPortal({ children }: { children: ReactNode }) {
  useEffect(() => {
    openCount += 1;
    if (openCount === 1) window.skillkit.setModalChromeHidden(true).catch(() => {});
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) window.skillkit.setModalChromeHidden(false).catch(() => {});
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
