/**
 * 把用户选择的图片文件缩放为正方形 PNG data URI，用作自定义 Agent / 项目的图标。
 * - 输出固定 128×128（展示位都很小：chip / 卡片 / ToolStack / 选择器，2x retina 仍清晰）。
 * - 保留透明（PNG）：logo 类图标居中放置，不被裁切。
 * - 不放大：原图小于 128 时按原尺寸居中，避免模糊。
 * - 失败（非图片 / 超大 / 解码失败）抛错，由调用方提示。
 */
const ICON_PX = 128;
// 源文件上限：解码后立即缩放，避免极端大图卡 UI。普通小图标远小于此。
const MAX_SRC_BYTES = 10 * 1024 * 1024;

export async function fileToIconDataUri(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  if (file.size > MAX_SRC_BYTES) throw new Error('image too large');

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const size = ICON_PX;
  // naturalWidth 为 0 时（极少数无内在尺寸的 SVG）按目标方形兜底。
  const iw = img.naturalWidth || size;
  const ih = img.naturalHeight || size;
  // contain：最长边贴 128，另一边按比例；min(.., 1) 防止小图被放大。
  const scale = Math.min(size / iw, size / ih, 1);
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL('image/png');
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('read failed'));
    fr.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode failed'));
    img.src = src;
  });
}
