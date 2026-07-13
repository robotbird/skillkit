import type { NextRequest } from 'next/server';
import { getStore } from '@/lib/store';
import { TOOL_LABELS, SHARE_BASE_URL, type Tool } from '@skillkit/types';
import { detectLocale } from '@/lib/i18n/detect';
import { translate } from '@/lib/i18n/t';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 来源 chip 圆点的品牌色（深/浅两种主题下都可见）
const TOOL_COLOR: Record<Tool, string> = {
  claude: '#D97757',
  codex: '#4F5BD5',
  cursor: '#9B968A',
  trae: '#1FAE6B',
  workbuddy: '#6C4DFF',
  qoder: '#2ADB5C',
  grok: '#1DA1F2',
  opencode: '#FF5C00',
  gemini: '#4285F4',
  antigravity: '#8B5CF6',
  windsurf: '#0EA5E9',
  augment: '#F59E0B',
  codebuddy: '#10B981',
  pi: '#EC4899',
  kiro: '#6366F1',
  hermes: '#EF4444',
  openclaw: '#14B8A6',
  cline: '#A855F7',
  warp: '#52525B',
  kimi: '#3B82F6',
};

// 分享接收页:返回完整 HTML 文档(自带内联 CSS/JS、OG/Twitter card、主题切换、复制链接)。
// 用 route handler 而非 page.tsx,以 1:1 保留原 app.ts 返回的完整文档、避开 layout 嵌套。
// 文案按请求的 Accept-Language 自动中/英(默认英文)。
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const locale = detectLocale(req.headers.get('accept-language'));
  const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const store = await getStore();
  const meta = await store.readMeta(id);
  const expired = meta && meta.expiresAt <= Date.now();

  // 注意:不要把用户内容直接拼进 HTML —— 转义
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 对外短链用稳定基地址 SHARE_BASE_URL(而非当前请求 host),避免 account 子域污染链接。
  const fullUrl = `${SHARE_BASE_URL}/share/${id}`;

  const titleWord = t('share.titleWord');
  const title = meta && !expired ? `${meta.name} · Skillkit ${titleWord}` : `Skillkit ${titleWord}`;
  const ogDesc =
    meta && !expired && meta.description
      ? meta.description
      : t('share.ogDescDefault');
  const ogImage = 'https://www.skillkit.net/assets/logo.png';

  let body: string;
  if (!meta) {
    body = `
      <p class="kicker">${t('share.kicker')}</p>
      <h1>${t('share.notFoundTitle')}</h1>
      <p class="desc">${t('share.notFoundDesc', { id: `<code>${esc(id)}</code>` })}</p>`;
  } else if (expired) {
    body = `
      <p class="kicker">${t('share.kicker')}</p>
      <h1>${t('share.expiredTitle')}</h1>
      <p class="desc">${t('share.expiredDesc', { id: `<code>${esc(id)}</code>` })}</p>`;
  } else {
    const expIn = Math.max(0, Math.ceil((meta.expiresAt - Date.now()) / (24 * 3600 * 1000)));
    const expText = expIn === 0 ? t('share.expiresToday') : t('share.expiresIn', { n: expIn });
    const sizeText =
      meta.sizeBytes >= 1024 * 1024
        ? `${(meta.sizeBytes / 1024 / 1024).toFixed(1)} MB`
        : `${(meta.sizeBytes / 1024).toFixed(1)} KB`;
    body = `
      <p class="kicker">${t('share.kicker')}</p>
      <h1>${esc(meta.name)}</h1>
      ${meta.description ? `<p class="desc">${esc(meta.description)}</p>` : ''}
      <div class="meta">
        <span class="chip tool"><span class="dot" style="background:${TOOL_COLOR[meta.sourceTool]}"></span>${esc(TOOL_LABELS[meta.sourceTool])}</span>
        <span class="chip">${sizeText}</span>
        <span class="chip">${expText}</span>
      </div>
      <div class="actions">
        <a class="btn btn-primary" href="skillkit://share/${esc(id)}">${t('share.openInSkillkit')}</a>
        <a class="btn" href="/share/${esc(id)}/zip" download="${esc(meta.name)}.zip">${t('share.downloadZip')}</a>
      </div>
      <div class="share">
        <div class="link"><code id="u">${esc(fullUrl)}</code><button type="button" onclick="copyLink(this)">${t('share.copyLink')}</button></div>
        <p class="muted">${t('share.noApp')}<a href="https://github.com/robotbird/skillkit/releases" target="_blank" rel="noopener">${t('share.downloadApp')}</a></p>
      </div>`;
  }

  const lang = locale === 'zh' ? 'zh-CN' : 'en';
  // 底部 <script> 里运行时切换的文案:用 JSON.stringify 注入为 JS 字符串字面量(引号自动转义)。
  const jsToggleDark = JSON.stringify(t('share.toggleToDark'));
  const jsToggleLight = JSON.stringify(t('share.toggleToLight'));
  const jsCopied = JSON.stringify(t('share.copied'));

  const html = `<!doctype html>
<html lang="${lang}">
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
<script>(function(){var m=document.querySelector('meta[name="theme-color"]');function tc(t){if(m)m.setAttribute('content',t==='light'?'#fafafa':'#1a1410');}try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.setAttribute('data-theme',t);tc(t);}catch(e){document.documentElement.setAttribute('data-theme','dark');tc('dark');}})();</script>
<style>
  :root{--ink:#f3ece1;--ink-soft:rgba(243,236,225,.72);--ink-mute:rgba(243,236,225,.46);--line:rgba(255,255,255,.08);--card-bg:rgba(28,22,18,.62);--card-line:rgba(255,235,200,.09);--accent:#ffb14a;--accent-soft:rgba(255,177,74,.18);--radius-card:16px;--radius-pill:999px;}
  :root[data-theme="light"]{--ink:#1a1a1a;--ink-soft:rgba(26,26,26,.72);--ink-mute:rgba(26,26,26,.5);--line:rgba(0,0,0,.08);--card-bg:#ffffff;--card-line:rgba(0,0,0,.08);--accent:#c9761a;--accent-soft:rgba(201,118,26,.14);}
  *{box-sizing:border-box;}
  html,body{margin:0;padding:0;}
  body{min-height:100vh;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",Arial,sans-serif;font-size:16px;line-height:1.6;letter-spacing:.01em;-webkit-font-smoothing:antialiased;}
  .bg{position:fixed;inset:0;z-index:-1;background:radial-gradient(1200px 600px at 50% -10%,rgba(255,170,80,.32),transparent 60%),radial-gradient(900px 520px at 100% 0,rgba(180,120,60,.2),transparent 65%),linear-gradient(180deg,#2a1d12 0%,#1a130d 45%,#120b07 100%);}
  :root[data-theme="light"] .bg{background:#fafafa;}
  a{color:var(--accent);text-decoration:none;}
  a:hover{text-decoration:underline;}
  :root[data-theme="light"] a{color:var(--ink);}
  code{background:rgba(255,255,255,.06);padding:1px 6px;border-radius:4px;font-family:"SF Mono",ui-monospace,Menlo,monospace;font-size:.92em;}
  :root[data-theme="light"] code{background:rgba(0,0,0,.05);}
  .wrap{max-width:680px;margin:0 auto;padding:0 20px;}
  .nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0 0;}
  .brand{display:inline-flex;align-items:center;gap:9px;font-weight:700;letter-spacing:.04em;color:var(--ink);}
  .brand:hover{text-decoration:none;}
  .brand .logo{width:24px;height:24px;border-radius:6px;display:block;}
  .theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:var(--radius-pill);border:1px solid var(--card-line);background:var(--card-bg);color:var(--ink);cursor:pointer;transition:transform .15s ease,background .15s ease;}
  .theme-toggle:hover{transform:translateY(-1px);}
  .theme-toggle svg{width:18px;height:18px;stroke:var(--ink);fill:none;stroke-width:1.8;stroke-linecap:round;}
  .theme-toggle .ico-moon{display:none;}
  :root[data-theme="dark"] .theme-toggle .ico-moon{display:inline;}
  :root[data-theme="dark"] .theme-toggle .ico-sun{display:none;}
  .card{margin-top:32px;padding:40px 36px;background:var(--card-bg);border:1px solid var(--card-line);border-radius:var(--radius-card);backdrop-filter:blur(14px) saturate(1.1);box-shadow:0 8px 30px rgba(0,0,0,.32);}
  :root[data-theme="light"] .card{box-shadow:0 1px 3px rgba(0,0,0,.05),0 1px 2px rgba(0,0,0,.03);}
  .kicker{margin:0 0 10px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;}
  :root[data-theme="light"] .kicker{color:var(--ink-soft);}
  h1{margin:0 0 12px;font-size:30px;line-height:1.2;}
  .desc{margin:0 0 22px;color:var(--ink-soft);font-size:16px;line-height:1.7;}
  .meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:26px;}
  .chip{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink-soft);padding:6px 12px;border-radius:var(--radius-pill);background:var(--accent-soft);border:1px solid var(--card-line);}
  :root[data-theme="light"] .chip{background:#f4f4f5;}
  .chip.tool{color:var(--ink);}
  .chip .dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
  .actions{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:22px;}
  .btn{display:inline-flex;align-items:center;gap:8px;justify-content:center;font-family:inherit;font-size:15px;font-weight:600;padding:12px 22px;border-radius:var(--radius-pill);border:1px solid var(--card-line);background:var(--card-bg);color:var(--ink);cursor:pointer;text-decoration:none;transition:transform .15s ease,background .15s ease;}
  .btn:hover{transform:translateY(-1px);text-decoration:none;background:rgba(60,42,30,.5);}
  :root[data-theme="light"] .btn:hover{background:rgba(0,0,0,.04);}
  .btn-primary{border:0;background:linear-gradient(180deg,#fff5db,#ffd99a);color:#1a1410;box-shadow:0 6px 18px rgba(0,0,0,.35);}
  .btn-primary:hover{background:linear-gradient(180deg,#fff8e6,#ffe0ac);}
  :root[data-theme="light"] .btn-primary{background:#1a1a1a;color:#ffffff;box-shadow:0 1px 2px rgba(0,0,0,.08);}
  :root[data-theme="light"] .btn-primary:hover{background:#000000;}
  .share{margin-top:8px;padding-top:20px;border-top:1px dashed var(--line);}
  .link{display:flex;align-items:center;gap:10px;margin-top:10px;padding:9px 12px;background:rgba(0,0,0,.18);border:1px solid var(--line);border-radius:12px;}
  :root[data-theme="light"] .link{background:rgba(0,0,0,.04);}
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
    <img class="logo" src="/logo.png" alt="" width="24" height="24" />
    <span>Skillkit</span>
  </a>
  <button id="theme-toggle" class="theme-toggle" type="button" aria-label="${esc(t('share.toggleInitialAria'))}">
    <svg class="ico-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.6M12 19.4V22M2 12h2.6M19.4 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
    <svg class="ico-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>
  </button>
</header>
<main class="wrap"><div class="card">${body}</div></main>
<footer class="wrap">${t('share.footer')}</footer>
<script>
  (function(){var root=document.documentElement,btn=document.getElementById('theme-toggle');if(!btn)return;function sync(){var l=root.getAttribute('data-theme')==='light';btn.setAttribute('aria-label',l?${jsToggleDark}:${jsToggleLight});}function tc(t){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#fafafa':'#1a1410');}btn.addEventListener('click',function(){var next=root.getAttribute('data-theme')==='light'?'dark':'light';try{localStorage.setItem('theme',next);}catch(e){}root.setAttribute('data-theme',next);tc(next);sync();});try{var mq=window.matchMedia('(prefers-color-scheme: light)');mq.addEventListener('change',function(e){if(localStorage.getItem('theme'))return;var next=e.matches?'light':'dark';root.setAttribute('data-theme',next);tc(next);sync();});}catch(e){}sync();})();
  function copyLink(btn){var el=document.getElementById('u');if(!el||!btn)return;navigator.clipboard.writeText(el.textContent).then(function(){var old=btn.textContent;btn.textContent=${jsCopied};setTimeout(function(){btn.textContent=old;},1400);});}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
