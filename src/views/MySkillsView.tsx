import { useEffect, useMemo, useState } from 'react';
import { ALL_TOOLS, TOOL_LABELS, type InstalledSkill, type Tool } from '@shared/types';
import SkillCard from '../components/SkillCard';
import ShareDialog from '../components/ShareDialog';
import ToolPicker from '../components/ToolPicker';
import type { ToastState } from '../components/Toast';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';

const TOOL_ICON: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
};

type ViewMode = 'grid' | 'list';

export default function MySkillsView({
  toast,
  onChanged,
}: {
  toast: ToastState;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<InstalledSkill[] | null>(null);
  const [q, setQ] = useState('');
  const [tool, setTool] = useState<Tool | 'all'>('all');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [scanning, setScanning] = useState(false);
  const [shareSkill, setShareSkill] = useState<InstalledSkill | null>(null);
  const [copySkill, setCopySkill] = useState<InstalledSkill | null>(null);
  const [copying, setCopying] = useState(false);

  async function refresh() {
    setScanning(true);
    try {
      const r = await window.skillzix.scanAll();
      setItems(r);
    } catch (e: any) {
      toast.show(`扫描失败：${e?.message ?? e}`, 'error');
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    if (!items) return [];
    const text = q.trim().toLowerCase();
    return items.filter((s) => {
      if (tool !== 'all' && s.tool !== tool) return false;
      if (!text) return true;
      return (
        s.name.toLowerCase().includes(text) ||
        (s.description ?? '').toLowerCase().includes(text)
      );
    });
  }, [items, q, tool]);

  const counts = useMemo(() => {
    const map: Record<Tool, number> = { claude: 0, codex: 0, cursor: 0, trae: 0 };
    if (items) for (const s of items) map[s.tool]++;
    return map;
  }, [items]);

  async function handleUninstall(t: Tool, name: string) {
    if (!confirm(`确认卸载 ${name} 吗？这会删除 ${TOOL_LABELS[t]} 下的整个 skill 目录。`)) return;
    try {
      await window.skillzix.uninstallSkill(t, name);
      toast.show(`${name} 已卸载`);
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.show(`卸载失败：${e?.message ?? e}`, 'error');
    }
  }

  async function handleCopy(targets: Tool[]) {
    if (!copySkill) return;
    setCopying(true);
    try {
      const results = await window.skillzix.copyToTools(copySkill.tool, copySkill.name, targets);
      const ok = results.filter((r) => r.ok).map((r) => TOOL_LABELS[r.tool]);
      const fail = results.filter((r) => !r.ok);
      if (ok.length && !fail.length) {
        toast.show(`已复制到：${ok.join('、')}`);
      } else if (fail.length) {
        const okPart = ok.length ? `已复制到：${ok.join('、')}` : '';
        const failPart = fail
          .map((r) => `${TOOL_LABELS[r.tool]}（${r.error ?? '失败'}）`)
          .join('；');
        toast.show([okPart, failPart].filter(Boolean).join('；'), 'error', 4000);
      }
      await refresh();
      onChanged();
      setCopySkill(null);
    } catch (e: any) {
      toast.show(`复制失败：${e?.message ?? e}`, 'error');
    } finally {
      setCopying(false);
    }
  }

  return (
    <section>
      <div className="view-head">
        <div>
          <h1 className="view-title">我的 Skill</h1>
          <p className="view-sub">
            共 <strong>{items?.length ?? 0}</strong> 个
            <span className="tool-counts">
              {ALL_TOOLS.map((t) => (
                <span key={t} className="tool-count" title={TOOL_LABELS[t]}>
                  <img src={TOOL_ICON[t]} alt={TOOL_LABELS[t]} draggable={false} />
                  {counts[t]}
                </span>
              ))}
            </span>
          </p>
        </div>
        <div className="view-tools">
          <label className="search">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path fill="currentColor" d="M10 4a6 6 0 014.47 9.97l4.78 4.78-1.5 1.5-4.78-4.78A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"/>
            </svg>
            <input placeholder="搜索 skill" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="seg" role="group" aria-label="视图切换">
            <button
              className={`seg-btn${mode === 'grid' ? ' is-active' : ''}`}
              onClick={() => setMode('grid')}
              title="网格"
            >
              <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
            </button>
            <button
              className={`seg-btn${mode === 'list' ? ' is-active' : ''}`}
              onClick={() => setMode('list')}
              title="列表"
            >
              <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h16v2H4v-2z"/></svg>
            </button>
          </div>
          <button className="btn-ghost" disabled={scanning} onClick={refresh}>
            {scanning ? <><span className="spinner" /> 扫描中</> : '重新扫描'}
          </button>
        </div>
      </div>

      <div className="chips">
        <button
          className={`chip${tool === 'all' ? ' is-active' : ''}`}
          onClick={() => setTool('all')}
        >
          全部（{items?.length ?? 0}）
        </button>
        {ALL_TOOLS.map((t) => (
          <button
            key={t}
            className={`chip chip-tool${tool === t ? ' is-active' : ''}`}
            onClick={() => setTool(t)}
          >
            <img className="chip-ico" src={TOOL_ICON[t]} alt="" draggable={false} />
            {TOOL_LABELS[t]}（{counts[t]}）
          </button>
        ))}
      </div>

      <div className="skills" data-mode={mode}>
        {items == null ? (
          <div className="empty"><span className="spinner" /> 正在扫描各工具的 skill 目录…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">{q ? '没有匹配的 skill' : '当前筛选下还没有 skill'}</div>
        ) : (
          filtered.map((s) => (
            <SkillCard
              key={`${s.tool}::${s.name}`}
              skill={s}
              mode={mode}
              onUninstall={handleUninstall}
              onReveal={(p) => window.skillzix.revealInFinder(p)}
              onShare={setShareSkill}
              onCopyTo={setCopySkill}
            />
          ))
        )}
      </div>

      <ShareDialog
        open={!!shareSkill}
        skill={shareSkill}
        onClose={() => setShareSkill(null)}
      />

      <ToolPicker
        open={!!copySkill}
        title={copySkill ? `复制 ${copySkill.name} 到其他工具` : '复制到其他工具'}
        subtitle={
          copySkill
            ? `从 ${TOOL_LABELS[copySkill.tool]} 复制到选中的工具，目标位置已存在的同名 skill 会被覆盖（先备份再回滚）。`
            : ''
        }
        defaultSelected={
          copySkill
            ? (ALL_TOOLS.filter((t) => t !== copySkill.tool).slice(0, 1) as Tool[])
            : []
        }
        excludeTools={copySkill ? [copySkill.tool] : []}
        busy={copying}
        confirmLabel="确认复制"
        busyLabel="复制中"
        onCancel={() => !copying && setCopySkill(null)}
        onConfirm={handleCopy}
      />
    </section>
  );
}
