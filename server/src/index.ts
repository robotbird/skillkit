import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { customAlphabet } from 'nanoid';
import {
  SHARE_TTL_MS,
  SHARE_MAX_BYTES,
  type ShareMeta,
  type Tool,
} from '../../shared/types.js';
import {
  ensureDir,
  exists,
  writeShare,
  readMeta,
  readZipStream,
  sweepExpired,
  deleteShare,
} from './store.js';

// 6 字符 base32（去掉容易混淆的 0/O/1/I/L）— 32^6 ≈ 1e9
const newId = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 6);

const VALID_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae'];

const app = new Hono();
app.use('*', cors());

// ---------- 健康检查 ----------
app.get('/', (c) =>
  c.json({ ok: true, service: 'skillzix-share', version: '0.1.0' }),
);

// ---------- 上传 ----------
app.post('/share', async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: '请求体不是 multipart/form-data' }, 400);
  }

  const name = (form.get('name') ?? '').toString().trim();
  const description = ((form.get('description') ?? '') as string).trim() || null;
  const sourceTool = (form.get('sourceTool') ?? '').toString().trim() as Tool;
  const file = form.get('file');

  if (!name) return c.json({ error: 'name 必填' }, 400);
  if (!VALID_TOOLS.includes(sourceTool))
    return c.json({ error: 'sourceTool 不合法' }, 400);
  if (!(file instanceof File))
    return c.json({ error: '缺少 file 字段或不是文件' }, 400);
  if (file.size > SHARE_MAX_BYTES)
    return c.json(
      { error: `文件超过 ${(SHARE_MAX_BYTES / 1024 / 1024).toFixed(0)}MB 上限` },
      413,
    );
  if (file.size <= 0) return c.json({ error: '文件为空' }, 400);

  const buf = Buffer.from(await file.arrayBuffer());

  // 生成 id（碰撞重试 3 次）
  let id = '';
  for (let i = 0; i < 3; i++) {
    const candidate = newId();
    if (!exists(candidate)) {
      id = candidate;
      break;
    }
  }
  if (!id) return c.json({ error: '生成 id 失败，请重试' }, 503);

  const now = Date.now();
  const meta: ShareMeta = {
    id,
    name,
    description,
    sourceTool,
    sizeBytes: buf.length,
    createdAt: now,
    expiresAt: now + SHARE_TTL_MS,
  };
  await writeShare(meta, buf);

  const proto = c.req.header('x-forwarded-proto') ?? 'http';
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '127.0.0.1:8787';
  const url = `${proto}://${host}/share/${id}`;
  return c.json({ id, url, expiresAt: meta.expiresAt }, 201);
});

// ---------- 元数据 ----------
app.get('/share/:id.json', async (c) => {
  const id = c.req.param('id') as string;
  const meta = await readMeta(id);
  if (!meta) return c.json({ error: '链接不存在' }, 404);
  if (meta.expiresAt <= Date.now()) {
    return c.json({ error: '链接已过期' }, 410);
  }
  return c.json(meta);
});

// ---------- 下载 zip ----------
app.get('/share/:id/zip', async (c) => {
  const id = c.req.param('id') as string;
  const meta = await readMeta(id);
  if (!meta) return c.json({ error: '链接不存在' }, 404);
  if (meta.expiresAt <= Date.now()) {
    return c.json({ error: '链接已过期' }, 410);
  }
  const stream = readZipStream(id);
  if (!stream) return c.json({ error: 'zip 文件丢失' }, 410);
  // 用 ReadableStream 包一层
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on('data', (chunk) =>
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk),
      );
      stream.on('end', () => controller.close());
      stream.on('error', (e) => controller.error(e));
    },
    cancel() {
      stream.destroy();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${meta.name}.zip"`,
      'content-length': String(meta.sizeBytes),
      'cache-control': 'no-store',
    },
  });
});

// ---------- 接收页（HTML） ----------
app.get('/share/:id', async (c) => {
  const id = c.req.param('id') as string;
  const meta = await readMeta(id);
  const expired = meta && meta.expiresAt <= Date.now();

  // 注意：不要把用户内容直接拼到 HTML —— 转义
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const fullUrl = `${c.req.header('x-forwarded-proto') ?? 'http'}://${
    c.req.header('host') ?? '127.0.0.1:8787'
  }/share/${id}`;

  let body: string;
  if (!meta) {
    body = `<h1>404</h1><p>分享 <code>${esc(id)}</code> 不存在或已被清理。</p>`;
  } else if (expired) {
    body = `<h1>已过期</h1><p>分享 <code>${esc(id)}</code> 已经过期。</p>`;
  } else {
    const expIn = Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / (24 * 3600 * 1000)));
    body = `
      <main>
        <p class="kicker">SKILLZIX 分享</p>
        <h1>${esc(meta.name)}</h1>
        ${meta.description ? `<p class="desc">${esc(meta.description)}</p>` : ''}
        <ul class="meta">
          <li>来源工具：<strong>${esc(meta.sourceTool)}</strong></li>
          <li>体积：${(meta.sizeBytes / 1024).toFixed(1)} KB</li>
          <li>${expIn === 0 ? '今天到期' : `${expIn} 天后过期`}</li>
        </ul>
        <h3>如何安装</h3>
        <ol>
          <li>打开 Skillzix 桌面应用 → <strong>安装 Skill</strong> 标签页</li>
          <li>把下面这条链接粘进 <strong>"从分享链接安装"</strong> 输入框</li>
          <li>勾选要安装到的工具，点 <strong>安装</strong></li>
        </ol>
        <div class="link"><code id="u">${esc(fullUrl)}</code> <button onclick="copyLink()">复制</button></div>
        <p class="muted">还没装？<a href="https://github.com/" target="_blank" rel="noopener">从这里下载 Skillzix</a></p>
      </main>
      <script>
        function copyLink() {
          navigator.clipboard.writeText(document.getElementById('u').textContent).then(() => {
            const b = event.target; const old = b.textContent;
            b.textContent = '已复制'; setTimeout(() => b.textContent = old, 1400);
          });
        }
      </script>`;
  }

  return c.html(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Skillzix Share — ${meta ? esc(meta.name) : id}</title>
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; padding: 0; min-height: 100%; background: #1a1410; color: #f3ece1;
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif; }
  body { background:
    radial-gradient(900px 500px at 50% -10%, rgba(255,170,80,.3), transparent 60%),
    radial-gradient(600px 400px at 100% 0, rgba(180,120,60,.2), transparent 65%),
    linear-gradient(180deg, #2a1d12 0%, #1a130d 45%, #120b07 100%); }
  main { max-width: 640px; margin: 60px auto; padding: 36px 32px;
    background: rgba(28,22,18,.62); border: 1px solid rgba(255,235,200,.09);
    border-radius: 18px; backdrop-filter: blur(14px) saturate(1.1);
    box-shadow: 0 8px 30px rgba(0,0,0,.32); }
  h1 { margin: 0 0 8px; font-size: 28px; }
  h3 { margin: 24px 0 8px; font-size: 14px; color: rgba(243,236,225,.72); text-transform: uppercase; letter-spacing: .08em; }
  .kicker { margin: 0 0 6px; font-size: 11px; color: #ffb14a; letter-spacing: .15em; text-transform: uppercase; }
  .desc { color: rgba(243,236,225,.78); line-height: 1.6; }
  .meta { padding: 0; list-style: none; display: flex; gap: 20px; flex-wrap: wrap; color: rgba(243,236,225,.55); font-size: 12.5px; }
  .meta strong { color: #ffd9a8; font-weight: 600; }
  ol { color: rgba(243,236,225,.85); line-height: 1.8; }
  .link { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
    background: rgba(20,14,10,.6); border: 1px solid rgba(255,255,255,.08);
    border-radius: 12px; margin-top: 10px; }
  .link code { flex: 1; font-family: "SF Mono", monospace; font-size: 12.5px; word-break: break-all; }
  button { font-family: inherit; font-size: 12.5px; padding: 6px 14px; border-radius: 999px;
    border: 0; background: linear-gradient(180deg,#fff5db,#ffd99a); color: #1a1410; cursor: pointer; }
  .muted { margin-top: 30px; font-size: 12px; color: rgba(243,236,225,.5); }
  a { color: #ffb14a; }
  code { background: rgba(255,255,255,.05); padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>${body}</body>
</html>`);
});

// ---------- 启动 ----------
ensureDir();

// 每小时清理一次过期的
const cleanupTimer = setInterval(async () => {
  try {
    const n = await sweepExpired();
    if (n > 0) console.log(`[cleanup] removed ${n} expired share(s)`);
  } catch (e) {
    console.error('[cleanup] failed', e);
  }
}, 60 * 60 * 1000);
cleanupTimer.unref?.();

// 启动时也跑一次
sweepExpired().then((n) => {
  if (n > 0) console.log(`[startup] removed ${n} expired share(s)`);
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';

serve(
  { fetch: app.fetch, port, hostname: host },
  (info) => {
    console.log(`Skillzix share server on http://${info.address}:${info.port}`);
  },
);

// 命令行工具：手动删除
if (process.argv[2] === '--delete' && process.argv[3]) {
  deleteShare(process.argv[3]).then(() => {
    console.log(`removed ${process.argv[3]}`);
    process.exit(0);
  });
}
