import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ALL_TOOLS, TOOL_LABELS, type InstalledSkill, type Tool, type GlobalRepoSkill } from '@shared/types';
import SkillCard from '../components/SkillCard';
import GlobalRepoCard from '../components/GlobalRepoCard';
import ShareDialog from '../components/ShareDialog';
import SkillDetailModal from '../components/SkillDetailModal';
import ToolPicker from '../components/ToolPicker';
import { useToolbarSlot } from '../components/ToolbarSlot';
import type { ToastState } from '../components/Toast';
import { groupBySkill, type SkillGroup } from '../lib/groupSkills';
import { useInstalledTools } from '../lib/useInstalledTools';
import { useI18n } from '../i18n';
import { TOOL_ICON } from '../lib/toolIcons';

type ViewMode = 'grid' | 'list';

export default function MySkillsView({
  toast,
  onChanged,
}: {
  toast: ToastState;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<InstalledSkill[] | null>(null);
  const [q, setQ] = useState('');
  const [tool, setTool] = useState<Tool | 'all' | 'global'>('all');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [scanning, setScanning] = useState(false);
  const [shareSkill, setShareSkill] = useState<InstalledSkill | null>(null);
  const [copyGroup, setCopyGroup] = useState<SkillGroup | null>(null);
  const [copying, setCopying] = useState(false);
  const [uninstallGroup, setUninstallGroup] = useState<SkillGroup | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [revealGroup, setRevealGroup] = useState<SkillGroup | null>(null);
  const [detailGroup, setDetailGroup] = useState<SkillGroup | null>(null);
  // 全局仓库（~/.agents/skills）
  const [globalSkills, setGlobalSkills] = useState<GlobalRepoSkill[] | null>(null);
  const [globalTarget, setGlobalTarget] = useState<GlobalRepoSkill | null>(null);
  const [installingGlobal, setInstallingGlobal] = useState(false);

  // 只展示「有 skill 的已装工具」chip；未装或 skill 数为 0 的不出现
  const { tools: installed, refresh: refreshInstalledTools } = useInstalledTools();

  // 工具 chip 单行横向滚动
  const chipsRef = useRef<HTMLDivElement>(null);
  const [chipScroll, setChipScroll] = useState({ left: false, right: false });

  const updateChipScroll = useCallback(() => {
    const el = chipsRef.current;
    if (!el) {
      setChipScroll({ left: false, right: false });
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 2;
    const right = max > 2 && el.scrollLeft < max - 2;
    setChipScroll((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  const scrollChips = useCallback(
    (dir: -1 | 1) => {
      const el = chipsRef.current;
      if (!el) return;
      const step = Math.max(160, Math.floor(el.clientWidth * 0.6));
      el.scrollBy({ left: dir * step, behavior: 'smooth' });
    },
    [],
  );

  // 统一工具栏槽位：把搜索/视图切换/重新扫描 注入到顶部 TopBar
  const toolbarHost = useToolbarSlot();

  async function refresh() {
    setScanning(true);
    try {
      const [r, g] = await Promise.all([
        window.skillkit.scanAll(),
        window.skillkit.scanGlobalRepo(),
        refreshInstalledTools(),
      ]);
      setItems(r);
      setGlobalSkills(g);
    } catch (e: any) {
      toast.show(t('my.toast.scanFail', { error: e?.message ?? e }), 'error');
    } finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 扁平记录 -> 按 name 合并的组（跨工具同一 skill 一组）
  const groups = useMemo(() => (items ? groupBySkill(items) : []), [items]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (tool !== 'all' && tool !== 'global' && !g.tools.includes(tool)) return false;
      if (!text) return true;
      return (
        g.name.toLowerCase().includes(text) ||
        (g.primary.description ?? '').toLowerCase().includes(text)
      );
    });
  }, [groups, q, tool]);

  // 全局仓库列表的文本筛选（独立于按工具的 filtered）
  const filteredGlobal = useMemo(() => {
    const text = q.trim().toLowerCase();
    const all = globalSkills ?? [];
    if (!text) return all;
    return all.filter(
      (g) =>
        g.name.toLowerCase().includes(text) ||
        (g.description ?? '').toLowerCase().includes(text),
    );
  }, [globalSkills, q]);

  // 每个 chip 的计数 = 包含该工具的「组」数（而非行数）
  const counts = useMemo(() => {
    const map = Object.fromEntries(ALL_TOOLS.map((t) => [t, 0])) as Record<Tool, number>;
    for (const g of groups) for (const tl of g.tools) map[tl]++;
    return map;
  }, [groups]);

  // 工具列表变化或窗口缩放时，刷新左右滚动按钮可用性
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const tick = () => requestAnimationFrame(updateChipScroll);
    tick();
    el.addEventListener('scroll', updateChipScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(tick) : null;
    ro?.observe(el);
    window.addEventListener('resize', tick);
    return () => {
      el.removeEventListener('scroll', updateChipScroll);
      ro?.disconnect();
      window.removeEventListener('resize', tick);
    };
  }, [updateChipScroll, installed.length, groups.length]);

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
    const removable = group.tools.filter((tool) => !group.byTool[tool]?.isBuiltin);
    if (removable.length <= 1) {
      const target = removable[0];
      if (!target) return;
      if (!confirm(t('my.confirm.uninstall', { name: group.name, tool: TOOL_LABELS[target] }))) return;
      void doUninstall(group.name, [target]);
    } else {
      setUninstallGroup(group);
    }
  }

  async function doUninstall(name: string, tools: Tool[]) {
    setUninstalling(true);
    try {
      for (const target of tools) await window.skillkit.uninstallSkill(target, name);
      toast.show(t('my.toast.uninstalled', { name, tools: tools.map((target) => TOOL_LABELS[target]).join(', ') }));
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.show(t('my.toast.uninstallFail', { error: e?.message ?? e }), 'error');
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
        toast.show(t('my.toast.copiedTo', { tools: ok.join(', ') }));
      } else if (fail.length) {
        const okPart = ok.length ? t('my.toast.copiedTo', { tools: ok.join(', ') }) : '';
        const failPart = fail
          .map((r) => t('my.toast.failedDetail', { tool: TOOL_LABELS[r.tool], error: r.error ?? t('my.toast.failFallback') }))
          .join('; ');
        toast.show([okPart, failPart].filter(Boolean).join('; '), 'error', 4000);
      }
      await refresh();
      onChanged();
      setCopyGroup(null);
    } catch (e: any) {
      toast.show(t('my.toast.copyFail', { error: e?.message ?? e }), 'error');
    } finally {
      setCopying(false);
    }
  }

  // ===== 全局仓库：安装到工具… =====
  async function handleInstallGlobalTo(targets: Tool[], method: 'symlink' | 'copy') {
    if (!globalTarget) return;
    setInstallingGlobal(true);
    try {
      const results = await window.skillkit.installGlobalToTools(globalTarget.name, targets, method);
      const ok = results.filter((r) => r.ok).map((r) => TOOL_LABELS[r.tool]);
      const fail = results.filter((r) => !r.ok);
      if (ok.length && !fail.length) {
        toast.show(t('my.toast.linkedTo', { tools: ok.join(', ') }));
      } else if (fail.length) {
        const okPart = ok.length ? t('my.toast.linkedTo', { tools: ok.join(', ') }) : '';
        const failPart = fail
          .map((r) => t('my.toast.failedDetail', { tool: TOOL_LABELS[r.tool], error: r.error ?? t('my.toast.failFallback') }))
          .join('; ');
        toast.show([okPart, failPart].filter(Boolean).join('; '), 'error', 4000);
      }
      await refresh();
      onChanged();
      setGlobalTarget(null);
    } catch (e: any) {
      toast.show(t('my.toast.linkFail', { error: e?.message ?? e }), 'error');
    } finally {
      setInstallingGlobal(false);
    }
  }

  // ===== 全局仓库：移除（规范副本 + 来源匹配的工具软链；独立副本保留并提示）=====
  async function doRemoveGlobal(target: GlobalRepoSkill) {
    try {
      const r = await window.skillkit.removeFromGlobalRepo(target.name);
      const parts: string[] = [t('my.toast.removedGlobal', { name: target.name })];
      if (r.removedLinks.length) {
        parts.push(t('my.toast.cleanedLinks', { tools: r.removedLinks.map((tl) => TOOL_LABELS[tl]).join(', ') }));
      }
      if (r.leftCopies.length) {
        parts.push(t('my.toast.leftCopies', { tools: r.leftCopies.map((tl) => TOOL_LABELS[tl]).join(', ') }));
      }
      toast.show(parts.join('; '), 'info', 5000);
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.show(t('my.toast.removeFail', { error: e?.message ?? e }), 'error');
    }
  }

  // 顶部统一工具栏控件（搜索 / 视图切换 / 重新扫描）-> portal 进 TopBar 槽位
  const toolbar = (
    <>
      <label className="search-toggle" title={t('my.searchTitle')}>
        <span className="search-toggle-ico">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M10 4a6 6 0 014.47 9.97l4.78 4.78-1.5 1.5-4.78-4.78A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
        </span>
        <input
          placeholder={t('my.searchPlaceholder')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <div className="seg" role="group" aria-label={t('my.viewSwitch')}>
        <button
          className={`seg-btn${mode === 'grid' ? ' is-active' : ''}`}
          onClick={() => setMode('grid')}
          title={t('my.grid')}
        >
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/></svg>
        </button>
        <button
          className={`seg-btn${mode === 'list' ? ' is-active' : ''}`}
          onClick={() => setMode('list')}
          title={t('my.list')}
        >
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h16v2H4v-2z"/></svg>
        </button>
      </div>
      <button
        className="rescan-btn"
        title={t('my.rescan')}
        aria-label={t('my.rescan')}
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
        <span className="rescan-label">{t('my.rescan')}</span>
      </button>
    </>
  );

  return (
    <section>
      {toolbarHost && createPortal(toolbar, toolbarHost)}

      <div className="chips-bar">
        <button
          type="button"
          className="chips-scroll-btn"
          aria-label={t('my.chips.scrollLeft')}
          disabled={!chipScroll.left}
          onClick={() => scrollChips(-1)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>
        <div className="chips" ref={chipsRef}>
          <button
            className={`chip${tool === 'all' ? ' is-active' : ''}`}
            onClick={() => setTool('all')}
          >
            {t('my.chipAll', { count: groups.length })}
          </button>
          <button
            className={`chip chip-global${tool === 'global' ? ' is-active' : ''}`}
            onClick={() => setTool('global')}
            title={t('my.chipGlobalTitle')}
          >
            <svg className="chip-ico" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2c1.7 0 3.3 2.5 3.8 6h-7.6C8.7 6.5 10.3 4 12 4zm-5.7 6h-2A8 8 0 015.5 6.6 12.4 12.4 0 006.3 10zm0 4a12.4 12.4 0 00-.8 3.4A8 8 0 014.3 14h2zm1.9 0h7.6c-.5 3.5-2.1 6-3.8 6s-3.3-2.5-3.8-6zm9.5 0h2a8 8 0 01-1.2 3.4A12.4 12.4 0 0018.5 14zm0-4a12.4 12.4 0 00.8-3.4A8 8 0 0119.7 10h-2z"/>
            </svg>
            {t('my.chipGlobal', { count: globalSkills?.length ?? 0 })}
          </button>
          {installed.map((tl) => (
            <button
              key={tl}
              className={`chip chip-tool${tool === tl ? ' is-active' : ''}`}
              onClick={() => setTool(tl)}
            >
              <img className="chip-ico" src={TOOL_ICON[tl]} alt="" draggable={false} />
              {t('my.chipTool', { label: TOOL_LABELS[tl], count: counts[tl] })}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="chips-scroll-btn"
          aria-label={t('my.chips.scrollRight')}
          disabled={!chipScroll.right}
          onClick={() => scrollChips(1)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
          </svg>
        </button>
      </div>

      <div className="skills" data-mode={mode}>
        {tool === 'global' ? (
          globalSkills == null ? (
            <div className="empty"><span className="spinner" /> {t('my.empty.scanningGlobal')}</div>
          ) : filteredGlobal.length === 0 ? (
            <div className="empty">
              {q ? t('my.empty.noMatch') : t('my.empty.globalEmpty')}
            </div>
          ) : (
            filteredGlobal.map((g) => (
              <GlobalRepoCard
                key={g.path}
                skill={g}
                mode={mode}
                onReveal={(s) => void window.skillkit.revealInFinder(s.path)}
                onRemove={(s) => {
                  if (
                    confirm(t('my.confirm.removeGlobal', { name: s.name }))
                  ) {
                    void doRemoveGlobal(s);
                  }
                }}
                onInstallTo={setGlobalTarget}
              />
            ))
          )
        ) : items == null ? (
          <div className="empty"><span className="spinner" /> {t('my.empty.scanningTools')}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">{q ? t('my.empty.noMatch') : t('my.empty.filteredEmpty')}</div>
        ) : (
          filtered.map((g) => (
            <SkillCard
              key={g.name}
              group={g}
              mode={mode}
              onUninstall={startUninstall}
              onReveal={startReveal}
              onShare={(grp) => setShareSkill(grp.primary)}
              onCopyTo={g.tools.length < ALL_TOOLS.length ? setCopyGroup : undefined}
              onOpenDetail={setDetailGroup}
            />
          ))
        )}
      </div>

      <ShareDialog
        open={!!shareSkill}
        skill={shareSkill}
        onClose={() => setShareSkill(null)}
      />

      <SkillDetailModal
        open={!!detailGroup}
        group={detailGroup}
        onClose={() => setDetailGroup(null)}
      />

      <ToolPicker
        open={!!uninstallGroup}
        title={uninstallGroup ? t('my.picker.uninstallTitle', { name: uninstallGroup.name }) : undefined}
        subtitle={uninstallGroup ? t('my.picker.uninstallSubtitle') : ''}
        defaultSelected={
          uninstallGroup
            ? uninstallGroup.tools.filter((tool) => !uninstallGroup.byTool[tool]?.isBuiltin)
            : []
        }
        excludeTools={
          // 只展示本组已装的工具
          uninstallGroup ? ALL_TOOLS.filter((tool) => !uninstallGroup.tools.includes(tool)) : []
        }
        disableTools={
          uninstallGroup
            ? uninstallGroup.tools.filter((tool) => uninstallGroup.byTool[tool]?.isBuiltin)
            : []
        }
        busy={uninstalling}
        confirmLabel={t('my.picker.uninstallConfirm')}
        busyLabel={t('my.picker.uninstallBusy')}
        tone="danger"
        onCancel={() => !uninstalling && setUninstallGroup(null)}
        onConfirm={(targets) => {
          if (uninstallGroup) void doUninstall(uninstallGroup.name, targets);
        }}
      />

      <ToolPicker
        open={!!copyGroup}
        allTools
        title={copyGroup ? t('my.picker.copyTitle', { name: copyGroup.name }) : undefined}
        subtitle={
          copyGroup
            ? t('my.picker.copySubtitle', { tool: TOOL_LABELS[copyGroup.primary.tool] })
            : ''
        }
        defaultSelected={
          copyGroup
            ? (installed.filter((tool) => !copyGroup.tools.includes(tool)).slice(0, 1) as Tool[])
            : []
        }
        excludeTools={copyGroup ? copyGroup.tools : []}
        busy={copying}
        confirmLabel={t('my.picker.copyConfirm')}
        busyLabel={t('my.picker.copyBusy')}
        onCancel={() => !copying && setCopyGroup(null)}
        onConfirm={handleCopy}
      />

      <ToolPicker
        open={!!revealGroup}
        multiple={false}
        title={revealGroup ? t('my.picker.revealTitle', { name: revealGroup.name }) : undefined}
        subtitle={revealGroup ? t('my.picker.revealSubtitle') : ''}
        defaultSelected={revealGroup ? [revealGroup.primary.tool] : []}
        excludeTools={
          // 只展示本组已装的工具（内置也可打开，不置灰）
          revealGroup ? ALL_TOOLS.filter((tool) => !revealGroup.tools.includes(tool)) : []
        }
        confirmLabel={t('my.picker.revealConfirm')}
        busyLabel={t('my.picker.revealBusy')}
        onCancel={() => setRevealGroup(null)}
        onConfirm={(targets) => {
          if (!revealGroup) return;
          const target = targets[0];
          const p = revealGroup.byTool[target]?.path;
          setRevealGroup(null);
          if (p) void window.skillkit.revealInFinder(p);
        }}
      />

      {/* 全局仓库 -> 安装到工具（锁定全局范围，仅选接入方式）*/}
      <ToolPicker
        open={!!globalTarget}
        lockedScope="global"
        title={globalTarget ? t('my.picker.globalTitle', { name: globalTarget.name }) : undefined}
        subtitle={t('my.picker.globalSubtitle')}
        busy={installingGlobal}
        confirmLabel={t('my.picker.globalConfirm')}
        busyLabel={t('my.picker.globalBusy')}
        onCancel={() => !installingGlobal && setGlobalTarget(null)}
        onConfirm={(targets, opts) => {
          void handleInstallGlobalTo(targets, opts.method ?? 'symlink');
        }}
      />
    </section>
  );
}
