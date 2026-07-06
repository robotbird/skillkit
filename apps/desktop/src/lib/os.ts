// 平台判定（渲染进程）。
// Windows 顶栏右上角有原生窗口控制按钮（titleBarOverlay，约 138–150px），
// 工具栏的左右安全区 padding 需要据此避让；macOS 右上角无控件、左上角为红绿灯。
export const isWindows =
  typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent);
