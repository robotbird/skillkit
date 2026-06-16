import {
  metaGet,
  metaSet,
  upsertMarketBatch,
  updateMarketDescription,
  getMarketBySlug,
  countMarket,
  listMarket,
} from './db.js';
import type { MarketSkill, MarketRefreshResult, MarketListQuery, MarketListResult } from '../shared/types.js';

const BASE = 'https://www.skills.sh';
const REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const OFFICIAL_OWNERS = new Set(['anthropics', 'vercel-labs', 'microsoft']);

function parseLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

interface ParsedSkillUrl {
  slug: string;
  owner: string;
  repo: string;
  name: string;
}

function parseSkillUrl(u: string): ParsedSkillUrl | null {
  try {
    const url = new URL(u);
    if (!url.hostname.endsWith('skills.sh')) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 3) return null; // /<owner>/<repo>/<skill>
    const [owner, repo, name] = parts;
    return { slug: `${owner}/${repo}/${name}`, owner, repo, name };
  } catch {
    return null;
  }
}

export async function refreshMarket(force = false): Promise<MarketRefreshResult> {
  const last = metaGet('sitemap_at');
  if (!force && last && Date.now() - Number(last) < REFRESH_TTL_MS) {
    return { count: countMarket(), fetched: false };
  }

  const sitemaps = ['sitemap-skills-1.xml', 'sitemap-skills-2.xml'];
  const items: Omit<MarketSkill, 'detailFetchedAt'>[] = [];
  for (const f of sitemaps) {
    const xml = await fetchWithRetry(`${BASE}/${f}`);
    if (!xml) continue;
    for (const u of parseLocs(xml)) {
      const p = parseSkillUrl(u);
      if (!p) continue;
      items.push({
        slug: p.slug,
        owner: p.owner,
        repo: p.repo,
        name: p.name,
        description: null,
        isOfficial: OFFICIAL_OWNERS.has(p.owner),
      });
    }
  }
  if (items.length) {
    upsertMarketBatch(items);
    metaSet('sitemap_at', String(Date.now()));
    return { count: countMarket(), fetched: true };
  }
  // 全部失败 → 不更新时间戳，下次还会再试
  return { count: countMarket(), fetched: false };
}

async function fetchWithRetry(url: string, retries = 3): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'Skillkit/0.2' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return await res.text();
    } catch {
      /* retry */
    }
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  return null;
}

export function listMarketSkills(q: MarketListQuery = {}): MarketListResult {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, q.pageSize ?? 30));
  const total = countMarket({ q: q.q, owner: q.owner });
  const items = listMarket({ q: q.q, owner: q.owner, page, pageSize });
  return { items, total, page, pageSize };
}

/**
 * 抓详情页，从 JSON-LD（@type=SoftwareApplication）抽 description。
 */
export async function fetchMarketDetail(slug: string): Promise<{ description: string | null }> {
  const cached = getMarketBySlug(slug);
  if (cached?.description && cached.detailFetchedAt) {
    return { description: cached.description };
  }

  const url = `${BASE}/${slug}`;
  const res = await fetch(url, { headers: { 'user-agent': 'Skillkit/0.2' } });
  if (!res.ok) {
    return { description: null };
  }
  const html = await res.text();
  const description = extractSoftwareAppDescription(html);
  updateMarketDescription(slug, description);
  return { description };
}

function extractSoftwareAppDescription(html: string): string | null {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      if (data && data['@type'] === 'SoftwareApplication' && typeof data.description === 'string') {
        return data.description.trim() || null;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}
