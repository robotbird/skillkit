import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * 把弹窗/遮罩 portal 到 document.body，使其脱离 `<main>` 的层叠上下文。
 *
 * 根因：`<main>` 是 `position: relative; z-index: 1`，会建立一个层叠上下文，
 * 弹窗（`.modal-mask`，`position: fixed; z-index: 100`）作为 main 的后代被「困」在
 * 层级 1，永远低于顶栏 `.topbar`（层级 2）——于是遮罩盖不住顶栏。
 * portal 到 body 后，弹窗直接参与根层叠上下文，z-index:100 自然盖住一切。
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
