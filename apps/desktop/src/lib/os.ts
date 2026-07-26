// 平台判定（渲染进程）。
// Windows 顶栏右上角有自绘画窗按钮（.window-controls，约 138px），
// 工具栏的左右安全区 padding 需要据此避让；macOS 右上角无控件、左上角为红绿灯。
export const isWindows =
  typeof navigator !== 'undefined' && /win/i.test(navigator.platform || navigator.userAgent);
