// Extract the white "SK" mark from public/logo.png into a transparent PNG
// (white mark, alpha derived from luminance so anti-aliased edges are kept).
// Used by the in-app TopBar logo so it blends with the dark theme (no bg tile).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SRC = 'public/logo.png';
const OUT = 'src/assets/logo-mark.png';

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width, height, data } = png; // data is RGBA
for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  // bright (white mark) -> opaque; dark bg -> transparent; mid -> gradient (AA)
  let a = Math.round(((lum - 60) * 255) / 195);
  if (a < 0) a = 0;
  else if (a > 255) a = 255;
  data[i] = 255;
  data[i + 1] = 255;
  data[i + 2] = 255;
  data[i + 3] = a;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log(`wrote ${OUT} (${width}x${height})`);
