import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_TOOLS, TOOL_LABELS, type InstalledSkill, type Tool } from '@shared/types';
import SkillCard from '../components/SkillCard';
import ShareDialog from '../components/ShareDialog';
import ToolPicker from '../components/ToolPicker';
import { useToolbarSlot } from '../components/ToolbarSlot';
import type { ToastState } from '../components/Toast';
import { groupBySkill, type SkillGroup } from '../lib/groupSkills';
import { useInstalledTools } from '../lib/useInstalledTools';
import claudeIcon from '../assets/agents/claude-code.svg';
import codexIcon from '../assets/agents/codex.svg';
import cursorIcon from '../assets/agents/cursor.svg';
import traeIcon from '../assets/agents/trae.svg';
import workbuddyIcon from '../assets/agents/workbuddy.svg';

const TOOL_ICON: Record<Tool, string> = {
  claude: claudeIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  trae: traeIcon,
  workbuddy: workbuddyIcon,
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
  const [copyGroup, setCopyGroup] = useState<SkillGroup | null>(null);
  const [copying, setCopying] = useState(false);
  const [uninstallGroup, setUninstallGroup] = useState<SkillGroup | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [revealGroup, setRevealGroup] = useState<SkillGroup | null>(null);

  // 只展示「已安装」工具的 chip;未安装工具不出现
  const { tools: installed } = useInstalledTools();

  // 统一工具栏槽位：把搜索/视图切换/重新扫描 注入到顶部 TopBar
  const toolbarHost = useToolbarSlot();

  async function refresh() {
    setScanning(true);
    try {
      const r = await window.skillkit.scanAll();
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

  // 扁平记录 → 按 name 合并的组（跨工具同一 skill 一组）
  const groups = useMemo(() => (items ? groupBySkill(items) : []), [items]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (tool !== 'all' && !g.tools.includes(tool)) return false;
      if (!text) return true;
      return (
        g.name.toLowerCase().includes(text) ||
        (g.primary.description ?? '').toLowerCase().includes(text)
      );
    });
  }, [groups, q, tool]);

  // 每个 chip 的计数 = 包含该工具的「组」数（而非行数）
  const counts = useMemo(() => {
    const map: Record<Tool, number> = { claude: 0, codex: 0, cursor: 0, trae: 0, workbuddy: 0 };
    for (const g of groups) for (const t of g.tools) map[t]++;
    return map;
  }, [groups]);

  // ===== 打开目录 =====
  // 入口：一个 skill 只装在一个工具下时直接打开；装在多个工具下时弹窗让用户选要打开哪个。
  function startReveal(group: SkillGroup) {
    if (group.tools.length <= 1) {
      void window.skillkit.revealInFinder(group.primary.path);
      return;
    }
    setRevealGroup(group);
  }

  // ===== 卸载 =====
  // 入口：仅一个可卸载工具时直接确认；多个（或含内置）时弹工具选择
  function startUninstall(group: SkillGroup) {
    const removable = group.tools.filter((t) => !group.byTool[t]?.isBuiltin);
    if (removable.length <= 1) {
      const t = removable[0];
      if (!t) return;
      if (!confirm(`确认卸载 ${group.name} 吗？这会删除 ${TOOL_LABELS[t]} 下的整个 skill 目录。`)) return;
      void doUninstall(group.name, [t]);
    } else {
      setUninstallGroup(group);
    }
  }

  async function doUninstall(name: string, tools: Tool[]) {
    setUninstalling(true);
    try {
      for (const t of tools) await window.skillkit.uninstallSkill(t, name);
      toast.show(`${name} 已从 ${tools.map((t) => TOOL_LABELS[t]).join('、')} 卸载`);
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.show(`卸载失败：${e?.message ?? e}`, 'error');
    } finally {
      setUninstalling(false);
      setUninstallGroup(null);
    }
  }

  // ===== 复制到其他工具 =====
  async function handleCopy(targets: Tool[]) {
    if (!copyGroup) return;
    setCopying(true);
    try {
      const results = await window.skillkit.copyToTools(
        copyGroup.primary.tool,
        copyGroup.primary.name,
        targets,
      );
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
      setCopyGroup(null);
    } catch (e: any) {
      toast.show(`复制失败：${e?.message ?? e}`, 'error');
    } finally {
      setCopying(false);
    }
  }

  // 顶部统一工具栏控件（搜索 / 视图切换 / 重新扫描）→ portal 进 TopBar 槽位
  const toolbar = (
    <>
      <label className="search-toggle" title="搜索 skill">
        <span className="search-toggle-ico">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M10 4a6 6 0 014.47 9.97l4.78 4.78-1.5 1.5-4.78-4.78A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
        </span>
        <input
          placeholder="搜索 skill"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
      <button
        className="rescan-btn"
        title="重新扫描"
        aria-label="重新扫描"
        disabled={scanning}
        onClick={refresh}
      >
        <span className="rescan-ico">
          {scanning ? (
            <span className="spinner" />
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0012 4a8 8 0 108 8h-2a6 6 0 11-6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          )}
        </span>
        <span className="rescan-label">重新扫描</span>
      </button>
    </>
  );

  return (
    <section>
      {toolbarHost && createPortal(toolbar, toolbarHost)}

      <div className="chips">
        <button
          className={`chip${tool === 'all' ? ' is-active' : ''}`}
          onClick={() => setTool('all')}
        >
          全部（{groups.length}）
        </button>
        {installed.map((t) => (
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
          filtered.map((g) => (
            <SkillCard
              key={g.name}
              group={g}
              mode={mode}
              onUninstall={startUninstall}
              onReveal={startReveal}
              onShare={(grp) => setShareSkill(grp.primary)}
              onCopyTo={g.tools.length < installed.length ? setCopyGroup : undefined}
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
        open={!!uninstallGroup}
        title={uninstallGroup ? `卸载 ${uninstallGroup.name}` : '卸载'}
        subtitle={
          uninstallGroup
            ? '从哪些工具卸载？内置工具不可卸载（已置灰）。'
            : ''
        }
        defaultSelected={
          uninstallGroup
            ? uninstallGroup.tools.filter((t) => !uninstallGroup.byTool[t]?.isBuiltin)
            : []
        }
        excludeTools={
          // 只展示本组已装的工具
          uninstallGroup ? ALL_TOOLS.filter((t) => !uninstallGroup.tools.includes(t)) : []
        }
        disableTools={
          uninstallGroup
            ? uninstallGroup.tools.filter((t) => uninstallGroup.byTool[t]?.isBuiltin)
            : []
        }
        busy={uninstalling}
        confirmLabel="确认卸载"
        busyLabel="卸载中"
        tone="danger"
        onCancel={() => !uninstalling && setUninstallGroup(null)}
        onConfirm={(targets) => {
          if (uninstallGroup) void doUninstall(uninstallGroup.name, targets);
        }}
      />

      <ToolPicker
        open={!!copyGroup}
        title={copyGroup ? `复制 ${copyGroup.name} 到其他工具` : '复制到其他工具'}
        subtitle={
          copyGroup
            ? `从 ${TOOL_LABELS[copyGroup.primary.tool]} 复制到选中的工具，目标位置已存在的同名 skill 会被覆盖（先备份再回滚）。`
            : ''
        }
        defaultSelected={
          copyGroup
            ? (installed.filter((t) => !copyGroup.tools.includes(t)).slice(0, 1) as Tool[])
            : []
        }
        excludeTools={copyGroup ? copyGroup.tools : []}
        busy={copying}
        confirmLabel="确认复制"
        busyLabel="复制中"
        onCancel={() => !copying && setCopyGroup(null)}
        onConfirm={handleCopy}
      />

      <ToolPicker
        open={!!revealGroup}
        multiple={false}
        title={revealGroup ? `打开 ${revealGroup.name} 的目录` : '打开目录'}
        subtitle={
          revealGroup ? '该 skill 装在多个工具下，选择要打开哪个工具的目录。' : ''
        }
        defaultSelected={revealGroup ? [revealGroup.primary.tool] : []}
        excludeTools={
          // 只展示本组已装的工具（内置也可打开，不置灰）
          revealGroup ? ALL_TOOLS.filter((t) => !revealGroup.tools.includes(t)) : []
        }
        confirmLabel="打开目录"
        busyLabel="打开中"
        onCancel={() => setRevealGroup(null)}
        onConfirm={(targets) => {
          if (!revealGroup) return;
          const t = targets[0];
          const p = revealGroup.byTool[t]?.path;
          setRevealGroup(null);
          if (p) void window.skillkit.revealInFinder(p);
        }}
      />
    </section>
  );
}
