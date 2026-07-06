import { useEffect, useMemo, useRef, useState } from 'react';
import { TOOL_LABELS, type MarketSkill, type Tool, type InstallResult, type InstallOpts } from '@shared/types';
import ToolPicker from '../components/ToolPicker';
import type { ToastState } from '../components/Toast';

const PAGE_SIZE = 30;

function summarizeResults(results: InstallResult[], labels: Record<Tool, string>): { ok: string; fail: string } {
  const ok = results.filter((r) => r.ok).map((r) => labels[r.tool]);
  const fail = results.filter((r) => !r.ok);
  return {
    ok: ok.length ? `已安装到：${ok.join('、')}` : '',
    fail: fail.length ? `失败：${fail.map((r) => `${labels[r.tool]}（${r.error}）`).join('；')}` : '',
  };
}

function emojiFor(name: string): string {
  const emojis = ['📝','📄','🎞️','📊','🎨','🧪','🔌','🌈','🪪','✨','🛠️','🧠','🔍','📦','🎬','✅','🛡️','📈','🖼️','🖥️','🗒️'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return emojis[h % emojis.length];
}

export default function MarketView({
  toast,
  onInstalled,
}: {
  toast: ToastState;
  onInstalled: () => void;
}) {
  const [items, setItems] = useState<MarketSkill[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [picker, setPicker] = useState<{ slug: string } | null>(null);
  const [installing, setInstalling] = useState(false);

  // 输入防抖
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setDebouncedQ(q.trim()), 220);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [q]);

  // 首次加载：刷新（仅在 24h 之外才真请求）
  useEffect(() => {
    (async () => {
      setRefreshing(true);
      try {
        await window.skillkit.marketRefresh(false);
      } catch (e: any) {
        toast.show(`市场刷新失败：${e?.message ?? e}`, 'error');
      } finally {
        setRefreshing(false);
      }
    })();
  }, []);

  // 加载分页
  useEffect(() => {
    (async () => {
      const r = await window.skillkit.marketList({ q: debouncedQ || undefined, page, pageSize: PAGE_SIZE });
      setItems(r.items);
      setTotal(r.total);
      // 懒加载没缓存的描述，并发 4
      lazyLoadDescriptions(r.items, (slug, desc) => {
        setItems((prev) => {
          if (!prev) return prev;
          return prev.map((it) => (it.slug === slug ? { ...it, description: desc } : it));
        });
      });
    })();
  }, [debouncedQ, page, refreshing]);

  // 检索改变时回到第一页
  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const r = await window.skillkit.marketRefresh(true);
      toast.show(r.fetched ? `已更新市场（${r.count} 个 skill）` : `市场缓存仍是新鲜的（${r.count} 个）`);
    } catch (e: any) {
      toast.show(`市场刷新失败：${e?.message ?? e}`, 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleInstall(targets: Tool[], opts: InstallOpts) {
    if (!picker) return;
    setInstalling(true);
    try {
      const results = await window.skillkit.installFromMarket(picker.slug, targets, opts);
      const { ok, fail } = summarizeResults(results, TOOL_LABELS);
      if (ok && !fail) toast.show(ok);
      else if (fail) toast.show([ok, fail].filter(Boolean).join('；'), 'error', 4000);
      onInstalled();
      setPicker(null);
    } catch (e: any) {
      toast.show(`安装失败：${e?.message ?? e}`, 'error');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <section>
      <div className="view-head">
        <div>
          <h1 className="view-title">推荐 Skill</h1>
          <p className="view-sub">来自 skills.sh · 共 <strong>{total}</strong> 个</p>
        </div>
        <div className="view-tools">
          <label className="search">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M10 4a6 6 0 014.47 9.97l4.78 4.78-1.5 1.5-4.78-4.78A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"/>
            </svg>
            <input placeholder="搜索 owner / repo / 名称" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button className="btn-ghost" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <><span className="spinner" /> 同步中</> : '同步市场'}
          </button>
        </div>
      </div>

      <div className="skills market-grid" data-mode="grid">
        {items == null ? (
          <div className="empty"><span className="spinner" /> 加载中…</div>
        ) : items.length === 0 ? (
          <div className="empty">未找到匹配的 skill</div>
        ) : (
          items.map((s) => (
            <article className="skill is-list" key={s.slug}>
              <div className="skill-ico">{emojiFor(s.name)}</div>
              <div className="skill-body">
                <div className="skill-row1">
                  <div className="skill-name" title={s.slug}>{s.name}</div>
                  {s.isOfficial && <span className="skill-tag tag-official">官方</span>}
                  <span className="skill-tag">@{s.owner}</span>
                </div>
                <div className="skill-desc">
                  {s.description ?? <span style={{ color: 'var(--ink-mute)' }}>正在加载描述…</span>}
                </div>
                <div className="skill-meta">
                  <span>{s.owner}/{s.repo}</span>
                </div>
              </div>
              <div className="skill-actions">
                <button className="btn-primary" onClick={() => setPicker({ slug: s.slug })}>
                  安装
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span>{page} / {totalPages}</span>
          <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      )}

      <ToolPicker
        open={!!picker}
        title="安装到哪些工具？"
        subtitle={picker ? `将从 GitHub 拉取 ${picker.slug} 并复制到所选工具的 skills 目录。` : ''}
        lockedScope="global"
        busy={installing}
        onCancel={() => !installing && setPicker(null)}
        onConfirm={handleInstall}
      />
    </section>
  );
}

// === 描述懒加载 (并发 4) ===
const detailQueue: { slug: string; cb: (slug: string, desc: string | null) => void }[] = [];
let detailRunning = 0;
const detailFetched = new Set<string>();

function lazyLoadDescriptions(
  items: MarketSkill[],
  onResolved: (slug: string, desc: string | null) => void,
) {
  for (const it of items) {
    if (it.description) continue;
    if (detailFetched.has(it.slug)) continue;
    detailFetched.add(it.slug);
    detailQueue.push({ slug: it.slug, cb: onResolved });
  }
  pumpDetailQueue();
}

function pumpDetailQueue() {
  while (detailRunning < 4 && detailQueue.length) {
    const job = detailQueue.shift()!;
    detailRunning++;
    window.skillkit
      .marketDetail(job.slug)
      .then((r) => job.cb(job.slug, r.description))
      .catch(() => {})
      .finally(() => {
        detailRunning--;
        pumpDetailQueue();
      });
  }
}
