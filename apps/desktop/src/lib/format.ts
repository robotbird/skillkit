/** skill 卡片共用的展示格式化工具（SkillCard / GlobalRepoCard 等复用）。 */

const EMOJIS = ['📝', '📄', '🎞️', '📊', '🎨', '🧪', '🔌', '🌈', '🪪', '✨', '🛠️', '🧠', '🔍', '📦', '🎬', '✅', '🛡️', '📈', '🖼️', '🖥️', '🗒️'];

/** 按名字哈希取一个稳定 emoji 图标（同名永远同图标）。 */
export function emojiFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EMOJIS[h % EMOJIS.length];
}

/** 字节数 → 人类可读（B / KB / MB）。 */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 毫秒时间戳 → 相对中文（今天 / 昨天 / N 天前 / N 月前 / 日期）。 */
export function formatTime(ts: number | null | undefined): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const day = 24 * 3600 * 1000;
  if (diff < day) return '今天';
  if (diff < 2 * day) return '昨天';
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))} 月前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

/** 截断字符串并加省略号。 */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
