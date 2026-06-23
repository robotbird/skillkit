import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { customAlphabet } from 'nanoid';
import { getStore } from './store.js';
import {
  SHARE_TTL_MS,
  SHARE_MAX_BYTES,
  type ShareMeta,
  type ShareCreateResult,
  type Tool,
} from './types.js';

// 6 字符 base32(去掉容易混淆的 0/O/1/I/L)— 32^6 ≈ 1e9
const newId = customAlphabet('23456789abcdefghijkmnpqrstuvwxyz', 6);

const VALID_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae'];

/**
 * 无副作用的 Hono app —— 阿里云(server/src/index.ts 的 serve)与 Vercel(api/* 函数文件
 * 的 fetch 导出)共用。**不加 basePath**:所有公开路径都是 /share/*、/sweep 这种干净形式
 * (用户要的 https://skillkit.net/share/<id>)。Vercel 函数文件物理上在 /api/(Vercel 要求),
 * 但由 vercel.json 的 rewrite(/share/:path* → /api/share/:path*、/sweep → /api/sweep)把公开
 * 路径映射过去;Web API 函数收到的是**原始**路径(/share/<id>),所以 app 必须按 /share/* 路由。
 * 阿里云本地 serve 直接收 /share/*,同样匹配。
 * 存储由 getStore() 按 SHARE_STORE 懒加载选取,import 时不会触发任何 IO。
 */
export const app = new Hono();
app.use('*', cors());

// ---------- 健康检查 ----------
app.get('/', (c) => c.json({ ok: true, service: 'skillkit-share', version: '0.1.0' }));

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
  if (!VALID_TOOLS.includes(sourceTool)) return c.json({ error: 'sourceTool 不合法' }, 400);
  if (!(file instanceof File)) return c.json({ error: '缺少 file 字段或不是文件' }, 400);
  if (file.size > SHARE_MAX_BYTES)
    return c.json({ error: `文件超过 ${(SHARE_MAX_BYTES / 1024 / 1024).toFixed(0)}MB 上限` }, 413);
  if (file.size <= 0) return c.json({ error: '文件为空' }, 400);

  const buf = Buffer.from(await file.arrayBuffer());

  const store = await getStore();

  // 生成 id(碰撞重试 3 次)
  let id = '';
  for (let i = 0; i < 3; i++) {
    const candidate = newId();
    if (!(await store.has(candidate))) {
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
  await store.writeShare(meta, buf);

  const proto = c.req.header('x-forwarded-proto') ?? 'http';
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '127.0.0.1:8787';
  const url = `${proto}://${host}/share/${id}`;
  const result: ShareCreateResult = { id, url, expiresAt: meta.expiresAt };
  return c.json(result, 201);
});

// ---------- 元数据 ----------
// 用 /share/:id/meta 而非 /share/:id.json:Hono 的 RegExpRouter 会让 /share/:id 和
// /share/:id.json 两条都匹配 /share/x.json,造成 param 捕获错乱。用独立段避开重叠。
app.get('/share/:id/meta', async (c) => {
  const id = c.req.param('id') as string;
  const store = await getStore();
  const meta = await store.readMeta(id);
  if (!meta) return c.json({ error: '链接不存在' }, 404);
  if (meta.expiresAt <= Date.now()) return c.json({ error: '链接已过期' }, 410);
  return c.json(meta);
});

// ---------- 下载 zip ----------
app.get('/share/:id/zip', async (c) => {
  const id = c.req.param('id') as string;
  const store = await getStore();
  const meta = await store.readMeta(id);
  if (!meta) return c.json({ error: '链接不存在' }, 404);
  if (meta.expiresAt <= Date.now()) return c.json({ error: '链接已过期' }, 410);

  const zip = await store.getZip(id);
  if (!zip) return c.json({ error: 'zip 文件丢失' }, 410);
  return new Response(zip.stream, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${meta.name}.zip"`,
      'content-length': String(zip.size),
      'cache-control': 'no-store',
    },
  });
});

// ---------- 接收页(HTML) ----------
// 来源工具的中文名（shared/types.ts 的 TOOL_LABELS 子集拷贝；api/ 不能 import shared/）
const TOOL_LABELS: Record<Tool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  trae: 'Trae',
};
// 来源 chip 圆点的品牌色（深/浅两种主题下都可见）
const TOOL_COLOR: Record<Tool, string> = {
  claude: '#D97757',
  codex: '#4F5BD5',
  cursor: '#9B968A',
  trae: '#1FAE6B',
};

app.get('/share/:id', async (c) => {
  const id = c.req.param('id') as string;
  const store = await getStore();
  const meta = await store.readMeta(id);
  const expired = meta && meta.expiresAt <= Date.now();

  // 注意:不要把用户内容直接拼进 HTML —— 转义
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const proto = c.req.header('x-forwarded-proto') ?? 'http';
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? '127.0.0.1:8787';
  const fullUrl = `${proto}://${host}/share/${id}`;

  // 标题 / OG / Twitter Card —— 让链接在 X / Slack / iMessage 里渲染成卡片（类似 github.com）
  const title = meta && !expired ? `${meta.name} · Skillkit 分享` : 'Skillkit 分享';
  const ogDesc =
    meta && !expired && meta.description
      ? meta.description
      : '通过 Skillkit 分享的 AI skill —— 7 天内可一键安装到 Claude Code / Codex / Cursor / Trae。';
  const ogImage = 'https://www.skillkit.net/assets/logo.png';

  let body: string;
  if (!meta) {
    body = `
      <p class="kicker">SKILLKIT 分享</p>
      <h1>链接不存在</h1>
      <p class="desc">分享 <code>${esc(id)}</code> 不存在或已被清理。</p>`;
  } else if (expired) {
    body = `
      <p class="kicker">SKILLKIT 分享</p>
      <h1>已过期</h1>
      <p class="desc">分享 <code>${esc(id)}</code> 已经过期。</p>`;
  } else {
    const expIn = Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / (24 * 3600 * 1000)));
    const expText = expIn === 0 ? '今天到期' : `${expIn} 天后过期`;
    const sizeText =
      meta.sizeBytes >= 1024 * 1024
        ? `${(meta.sizeBytes / 1024 / 1024).toFixed(1)} MB`
        : `${(meta.sizeBytes / 1024).toFixed(1)} KB`;
    body = `
      <p class="kicker">SKILLKIT 分享</p>
      <h1>${esc(meta.name)}</h1>
      ${meta.description ? `<p class="desc">${esc(meta.description)}</p>` : ''}
      <div class="meta">
        <span class="chip tool"><span class="dot" style="background:${TOOL_COLOR[meta.sourceTool]}"></span>${esc(TOOL_LABELS[meta.sourceTool])}</span>
        <span class="chip">${sizeText}</span>
        <span class="chip">${expText}</span>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="skillkit://share/${esc(id)}">从 Skillkit 打开</a>
        <a class="btn" href="/share/${esc(id)}/zip" download="${esc(meta.name)}.zip">下载压缩包</a>
      </div>
      <div class="share">
        <div class="link"><code id="u">${esc(fullUrl)}</code><button type="button" onclick="copyLink(this)">复制链接</button></div>
        <p class="muted">没有 Skillkit？<a href="https://github.com/robotbird/skillkit/releases" target="_blank" rel="noopener">下载桌面端 →</a></p>
      </div>`;
  }

  return c.html(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#1a1410" />
<title>${esc(title)}</title>
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Skillkit" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(ogDesc)}" />
<meta property="og:url" content="${esc(fullUrl)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@PMAndDog" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(ogDesc)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<script>(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();</script>
<style>
  :root{--ink:#f3ece1;--ink-soft:rgba(243,236,225,.72);--ink-mute:rgba(243,236,225,.46);--line:rgba(255,255,255,.08);--card-bg:rgba(28,22,18,.62);--card-line:rgba(255,235,200,.09);--accent:#ffb14a;--accent-soft:rgba(255,177,74,.18);--radius-card:16px;--radius-pill:999px;}
  :root[data-theme="light"]{--ink:#2a2018;--ink-soft:rgba(42,32,24,.74);--ink-mute:rgba(42,32,24,.5);--line:rgba(60,40,20,.12);--card-bg:rgba(255,250,242,.72);--card-line:rgba(120,80,40,.16);--accent:#b26612;--accent-soft:rgba(178,102,18,.14);}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{min-height:100vh;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:1.6;letter-spacing:.01em;-webkit-font-smoothing:antialiased;}
  .bg{position:fixed;inset:0;z-index:-1;background:radial-gradient(1200px 600px at 50% -10%,rgba(255,170,80,.32),transparent 60%),radial-gradient(900px 520px at 100% 0,rgba(180,120,60,.2),transparent 65%),linear-gradient(180deg,#2a1d12 0%,#1a130d 45%,#120b07 100%);}
  :root[data-theme="light"] .bg{background:radial-gradient(1200px 600px at 50% -10%,rgba(255,170,80,.26),transparent 60%),radial-gradient(900px 520px at 100% 0,rgba(180,120,60,.12),transparent 65%),linear-gradient(180deg,#fbf3e6 0%,#f2e8d8 45%,#e9dcc8 100%);}
  a{color:var(--accent);text-decoration:none;}
  a:hover{text-decoration:underline;}
  code{background:rgba(255,255,255,.06);padding:1px 6px;border-radius:4px;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:.92em;}
  :root[data-theme="light"] code{background:rgba(60,40,20,.07);}
  .wrap{max-width:680px;margin:0 auto;padding:0 20px;}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0 0;}
  .brand{display:inline-flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.04em;color:var(--ink);}
  .brand:hover{text-decoration:none;}
  .brand .logo{width:26px;height:26px;border-radius:8px;display:block;}
  .theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:var(--radius-pill);border:1px solid var(--card-line);background:var(--card-bg);color:var(--ink);cursor:pointer;transition:transform .15s ease,background .15s ease;}
  .theme-toggle:hover{transform:translateY(-1px);}
  .theme-toggle svg{width:18px;height:18px;stroke:var(--ink);fill:none;stroke-width:1.8;stroke-linecap:round;}
  .theme-toggle .ico-moon{display:none;}
  :root[data-theme="dark"] .theme-toggle .ico-moon{display:inline;}
  :root[data-theme="dark"] .theme-toggle .ico-sun{display:none;}
  .card{margin-top:32px;padding:40px 36px;background:var(--card-bg);border:1px solid var(--card-line);border-radius:var(--radius-card);backdrop-filter:blur(14px) saturate(1.1);box-shadow:0 8px 30px rgba(0,0,0,.32);}
  .kicker{margin:0 0 10px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;}
  h1{margin:0 0 12px;font-size:30px;line-height:1.2;}
  .desc{margin:0 0 22px;color:var(--ink-soft);font-size:16px;line-height:1.7;}
  .meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:26px;}
  .chip{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-soft);padding:6px 12px;border-radius:var(--radius-pill);background:var(--accent-soft);border:1px solid var(--card-line);}
  .chip.tool{color:var(--ink);}
  .chip .dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
  .actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px;}
  .btn{display:inline-flex;align-items:center;gap:8px;justify-content:center;font-family:inherit;font-size:15px;font-weight:600;padding:12px 22px;border-radius:var(--radius-pill);border:1px solid var(--card-line);background:var(--card-bg);color:var(--ink);cursor:pointer;text-decoration:none;transition:transform .15s ease,background .15s ease;}
  .btn:hover{transform:translateY(-1px);text-decoration:none;background:rgba(60,42,30,.5);}
  :root[data-theme="light"] .btn:hover{background:rgba(255,255,255,.92);}
  .btn-primary{border:0;background:linear-gradient(180deg,#fff5db,#ffd99a);color:#1a1410;box-shadow:0 6px 18px rgba(0,0,0,.35);}
  .btn-primary:hover{background:linear-gradient(180deg,#fff8e6,#ffe0ac);}
  .share{margin-top:8px;padding-top:20px;border-top:1px dashed var(--line);}
  .link{display:flex;align-items:center;gap:10px;margin-top:10px;padding:9px 12px;background:rgba(0,0,0,.18);border:1px solid var(--line);border-radius:12px;}
  :root[data-theme="light"] .link{background:rgba(60,40,20,.06);}
  .link code{flex:1;word-break:break-all;color:var(--ink-soft);background:none;padding:0;}
  .link button{font-family:inherit;font-size:12.5px;padding:6px 14px;border-radius:999px;border:1px solid var(--card-line);background:var(--card-bg);color:var(--ink);cursor:pointer;}
  .muted{margin:14px 0 0;font-size:12.5px;color:var(--ink-mute);}
  footer{margin:28px 0 56px;color:var(--ink-mute);font-size:12.5px;}
  footer a{color:var(--ink-soft);}
  @media (max-width:560px){.card{padding:30px 22px;margin-top:22px;}h1{font-size:26px;}.actions .btn{flex:1;}}
</style>
</head>
<body>
<div class="bg" aria-hidden="true"></div>
<header class="nav wrap">
  <a class="brand" href="https://skillkit.net">
    <svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#ffb14a"/><path fill="#1a1410" d="M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z"/></svg>
    <span>Skillkit</span>
  </a>
  <button id="theme-toggle" class="theme-toggle" type="button" aria-label="切换深色 / 浅色主题">
    <svg class="ico-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
    <svg class="ico-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>
  </button>
</header>
<main class="wrap"><div class="card">${body}</div></main>
<footer class="wrap">由 <a href="https://skillkit.net">Skillkit</a> 分享 · 链接 7 天内有效</footer>
<script>
  (function(){var root=document.documentElement,btn=document.getElementById('theme-toggle');if(!btn)return;function sync(){var l=root.getAttribute('data-theme')==='light';btn.setAttribute('aria-label',l?'切换到深色模式':'切换到浅色模式');}btn.addEventListener('click',function(){var next=root.getAttribute('data-theme')==='light'?'dark':'light';try{localStorage.setItem('theme',next);}catch(e){}root.setAttribute('data-theme',next);sync();});try{var mq=window.matchMedia('(prefers-color-scheme: light)');mq.addEventListener('change',function(e){if(localStorage.getItem('theme'))return;root.setAttribute('data-theme',e.matches?'light':'dark');sync();});}catch(e){}sync();})();
  function copyLink(btn){var el=document.getElementById('u');if(!el||!btn)return;navigator.clipboard.writeText(el.textContent).then(function(){var old=btn.textContent;btn.textContent='已复制';setTimeout(function(){btn.textContent=old;},1400);});}
</script>
</body>
</html>`);
});

// ---------- Cron 清理(Vercel 专用,阿里云走 index.ts 的 setInterval) ----------
// 过期 share 读时已返回 410,这里只是清理 Blob 省存储。用 CRON_SECRET 鉴权。
app.get('/sweep', async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: '未配置 CRON_SECRET,清理未启用' }, 503);
  const auth = c.req.header('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) return c.json({ error: '未授权' }, 401);
  const n = await (await getStore()).sweepExpired();
  return c.json({ swept: n });
});
