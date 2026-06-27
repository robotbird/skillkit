// 让 TypeScript 知道 .svg/.png 在 Vite 下默认导出为图片 URL（字符串）
declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}
