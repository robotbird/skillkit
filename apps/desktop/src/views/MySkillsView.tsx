import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DropdownMenu } from 'radix-ui';
import { type InstalledSkill, type Tool, type GlobalRepoSkill, type SkillUpdateState, type SkillUpdateSummary, GLOBAL_TOOL } from '@shared/types';
import SkillCard from '../components/SkillCard';
import GlobalRepoCard from '../components/GlobalRepoCard';
import SkillBatchDialog, { planSkillBatch, type BatchAction, type BatchSkill } from '../components/SkillBatchDialog';
import ShareDialog from '../components/ShareDialog';
import SkillDetailModal, {
  skillDetailFromGroup,
  skillDetailFromGlobalRepo,
  type SkillDetail,
} from '../components/SkillDetailModal';
import ToolPicker from '../components/ToolPicker';
import { useToolbarSlot } from '../components/ToolbarSlot';
import type { ToastState } from '../components/Toast';
import { groupBySkill, type SkillGroup } from '../lib/groupSkills';
import { useInstalledTools } from '../lib/useInstalledTools';
import { useLocalTools } from '../lib/useLocalTools';
import { useCustomTools, useToolCatalog } from '../lib/toolCatalog';
import { Button, buttonVariants } from '../components/ui/button';
import { cn } from '../lib/utils';
import { useI18n } from '../i18n';

type ViewMode = 'grid' | 'list';

const updateFilters = [
  { value: 'all', label: 'my.filter.all' },
  { value: 'update_available', label: 'my.filter.available' },
  { value: 'up_to_date', label: 'my.filter.current' },
] as const;
type UpdateFilter = (typeof updateFilters)[number]['value'];

export default function MySkillsView({
  toast,
  onChanged,
}: {
  toast: ToastState;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const { allTools, label, icon } = useToolCatalog();
  const [items, setItems] = useState<InstalledSkill[] | null>(null);
  // skill 更新状态（按 `${tool}|${name}` 索引）；与 items join 出每张卡片的「可更新」徽章
  const [updateMap, setUpdateMap] = useState<Record<string, SkillUpdateState> | null>(null);
  const [q, setQ] = useState('');
  const [updateFilter, setUpdateFilter] = useState<UpdateFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const hasFilters = Boolean(q.trim()) || updateFilter !== 'all';
  const searchExpanded = searchOpen || hasFilters;
  const [tool, setTool] = useState<Tool | 'all' | 'global'>('all');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [batch, setBatch] = useState<{
    action: BatchAction;
    jobs: ReturnType<typeof planSkillBatch>;
  } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [shareSkill, setShareSkill] = useState<InstalledSkill | null>(null);
  const [copyGroup, setCopyGroup] = useState<SkillGroup | null>(null);
  const [copying, setCopying] = useState(false);
  const [uninstallGroup, setUninstallGroup] = useState<SkillGroup | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [revealGroup, setRevealGroup] = useState<SkillGroup | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  // 全局仓库（~/.agents/skills）
  const [globalSkills, setGlobalSkills] = useState<GlobalRepoSkill[] | null>(null);
  const [globalTarget, setGlobalTarget] = useState<GlobalRepoSkill | null>(null);
  const [installingGlobal, setInstallingGlobal] = useState(false);

  // 展示「skill 根目录已存在」的已装工具 chip；skill 数可为 0（目录在就要能识别，不要求已有 skill）
  const { tools: installed, refresh: refreshInstalledTools } = useInstalledTools();
  // 复制/安装目标的候选：真身探测命中的本机工具（与安装页同一口径）
  const { tools: localTools, ready: localReady } = useLocalTools();
  const { customs } = useCustomTools();

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
      const [r, g, , um] = await Promise.all([
        window.skillkit.scanAll(),
        window.skillkit.scanGlobalRepo(),
        refreshInstalledTools(),
        window.skillkit.getSkillUpdateMap(),
      ]);
      setItems(r);
      setGlobalSkills(g);
      setUpdateMap(um);
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

  // 监听「一轮检测完成」（顶部按钮手动 / 后台调度都会推）：刷新徽章 + Toast 反馈。
  // MySkillsView 每次 onChanged 会因 key 变化而 remount，故必须返回取消订阅避免监听器累积泄漏。
  useEffect(() => {
    const off = window.skillkit.onSkillUpdatesChecked((s: SkillUpdateSummary) => {
      window.skillkit.getSkillUpdateMap().then(setUpdateMap).catch(() => {});
      if (s.available > 0) {
        toast.show(t('my.toast.updatesAvailable', { count: s.available }), 'info', 4000);
      } else if (s.triggeredBy === 'manual') {
        toast.show(t('my.toast.allUpToDate'));
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 应用更新：用原 source 重装到本组所有工具（复用安装的备份+回滚）。 */
  async function startUpdate(group: SkillGroup) {
    try {
      const results = await window.skillkit.applySkillUpdate(group.primary.tool, group.name);
      const ok = results.filter((r) => r.ok).map((r) => label(r.tool));
      const fail = results.filter((r) => !r.ok);
      if (ok.length && !fail.length) {
        toast.show(t('my.toast.updated', { name: group.name, tools: ok.join(', ') }));
      } else if (fail.length) {
        const okPart = ok.length ? t('my.toast.updated', { name: group.name, tools: ok.join(', ') }) : '';
        const failPart = fail
          .map((r) => t('my.toast.failedDetail', { tool: label(r.tool), error: r.error ?? t('my.toast.failFallback') }))
          .join('; ');
        toast.show([okPart, failPart].filter(Boolean).join('; '), 'error', 4000);
      }
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.show(t('my.toast.updateFail', { error: e?.message ?? e }), 'error');
    }
  }

  /** 取某组的更新状态（同 skill 跨工具同源，取 primary.tool 的行即可）。 */
  function updateStatusOf(g: SkillGroup) {
    return updateMap?.[`${g.primary.tool}|${g.name}`]?.updateStatus;
  }

  // 扁平记录 -> 按 name 合并的组（跨工具同一 skill 一组）
  const groups = useMemo(() => (items ? groupBySkill(items, allTools) : []), [items, allTools]);

  const filtered = useMemo(() => {
    if (tool === 'global') return [];
    const text = q.trim().toLowerCase();
    return groups.filter((g) => {
      if (tool !== 'all' && !g.tools.includes(tool)) return false;
      if (updateFilter !== 'all') {
        const targets = tool === 'all' ? g.tools : [tool];
        const statuses = targets.map((target) => updateMap?.[`${target}|${g.name}`]?.updateStatus);
        const matches = updateFilter === 'update_available'
          ? statuses.includes(updateFilter)
          : statuses.every((status) => status === updateFilter);
        if (!matches) return false;
      }
      if (!text) return true;
      return (
        g.name.toLowerCase().includes(text) ||
        (g.primary.description ?? '').toLowerCase().includes(text)
      );
    });
  }, [groups, q, tool, updateFilter, updateMap]);

  // 全局仓库列表的文本筛选（独立于按工具的 filtered）
  const filteredGlobal = useMemo(() => {
    if (updateFilter !== 'all') return [];
    const text = q.trim().toLowerCase();
    const all = globalSkills ?? [];
    if (!text) return all;
    return all.filter(
      (g) =>
        g.name.toLowerCase().includes(text) ||
        (g.description ?? '').toLowerCase().includes(text),
    );
  }, [globalSkills, q, updateFilter]);

  // 全局仓里「未被任何工具组覆盖」的 skill：同名已由工具组（SkillCard）代表，不再重复出一张全局仓卡。
  // 仅并入「全部」chip，让全局仓独有（未链接进任何工具）的 skill 也能被浏览/搜到。
  const globalOnly = useMemo(() => {
    const names = new Set(groups.map((g) => g.name.toLowerCase()));
    return (globalSkills ?? []).filter((g) => !names.has(g.name.toLowerCase()));
  }, [globalSkills, groups]);

  // globalOnly 的文本筛选（与 filteredGlobal 同款 name/description 子串逻辑）
  const globalOnlyFiltered = useMemo(() => {
    if (updateFilter !== 'all') return [];
    const text = q.trim().toLowerCase();
    if (!text) return globalOnly;
    return globalOnly.filter(
      (g) =>
        g.name.toLowerCase().includes(text) ||
        (g.description ?? '').toLowerCase().includes(text),
    );
  }, [globalOnly, q, updateFilter]);

  const visibleGlobal = tool === 'global' ? filteredGlobal : tool === 'all' ? globalOnlyFiltered : [];
  const rowIds = [
    ...filtered.map((group) => `installed:${group.name}`),
    ...visibleGlobal.map((skill) => `global:${skill.path}`),
  ];
  const selectedCount = rowIds.filter((id) => selection.has(id)).length;
  const allSelected = rowIds.length > 0 && selectedCount === rowIds.length;

  useEffect(() => {
    setSelection(new Set());
  }, [mode, q, tool, updateFilter]);

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedCount > 0 && !allSelected;
  }, [selectedCount, allSelected]);

  const selectedSkills: BatchSkill[] = [];
  if (selectedCount > 0) {
    for (const group of filtered) {
      if (selection.has(`installed:${group.name}`)) selectedSkills.push({ kind: 'installed', group });
    }
    for (const skill of visibleGlobal) {
      if (!selection.has(`global:${skill.path}`)) continue;
      const installedTools = groups
        .filter((group) => group.name.toLowerCase() === skill.name.toLowerCase())
        .flatMap((group) => group.tools);
      selectedSkills.push({ kind: 'global', skill, installedTools });
    }
  }
  const scope = tool === 'all' || tool === 'global' ? null : tool;
  const copyTargets = allTools.filter((target) =>
    !customs.some((custom) => custom.id === target && custom.kind === 'project') &&
    (localTools.includes(target) || (localReady && localTools.length === 0)),
  );
  const copyJobs = planSkillBatch(selectedSkills, 'copy', scope, copyTargets);
  const uninstallJobs = planSkillBatch(selectedSkills, 'uninstall', scope, []);

  function rowSelection(id: string, name: string) {
    if (mode !== 'list') return undefined;
    return (
      <input
        type="checkbox"
        className="size-4 shrink-0 cursor-pointer accent-[var(--accent)]"
        aria-label={t('my.batch.selectSkill', { name })}
        checked={selection.has(id)}
        onChange={(e) => {
          const checked = e.target.checked;
          setSelection((previous) => {
            const next = new Set(previous);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
          });
        }}
      />
    );
  }

  useEffect(() => {
    if (!searchOpen) return;
    function closeSearchOutside(e: Event) {
      if (!(e.target instanceof Node)) return;
      if (searchRef.current?.contains(e.target) || filterMenuRef.current?.contains(e.target)) return;
      setSearchOpen(false);
    }
    document.addEventListener('pointerdown', closeSearchOutside);
    document.addEventListener('focusin', closeSearchOutside);
    return () => {
      document.removeEventListener('pointerdown', closeSearchOutside);
      document.removeEventListener('focusin', closeSearchOutside);
    };
  }, [searchOpen]);

  // 每个 chip 的计数 = 包含该工具的「组」数（而非行数）
  const counts = useMemo(() => {
    const map = Object.fromEntries(allTools.map((t) => [t, 0])) as Record<Tool, number>;
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
      if (!confirm(t('my.confirm.uninstall', { name: group.name, tool: label(target) }))) return;
      void doUninstall(group.name, [target]);
    } else {
      setUninstallGroup(group);
    }
  }

  async function doUninstall(name: string, tools: Tool[]) {
    setUninstalling(true);
    try {
      for (const target of tools) await window.skillkit.uninstallSkill(target, name);
      toast.show(t('my.toast.uninstalled', { name, tools: tools.map((target) => label(target)).join(', ') }));
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
      const ok = results.filter((r) => r.ok).map((r) => label(r.tool));
      const fail = results.filter((r) => !r.ok);
      if (ok.length && !fail.length) {
        toast.show(t('my.toast.copiedTo', { tools: ok.join(', ') }));
      } else if (fail.length) {
        const okPart = ok.length ? t('my.toast.copiedTo', { tools: ok.join(', ') }) : '';
        const failPart = fail
          .map((r) => t('my.toast.failedDetail', { tool: label(r.tool), error: r.error ?? t('my.toast.failFallback') }))
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

  // ===== 全局仓库：复制到其他工具（软链接入，文案与 skill 卡复制弹窗一致）=====
  async function handleInstallGlobalTo(targets: Tool[], method: 'symlink' | 'copy') {
    if (!globalTarget) return;
    setInstallingGlobal(true);
    try {
      const results = await window.skillkit.installGlobalToTools(globalTarget.name, targets, method);
      const ok = results.filter((r) => r.ok).map((r) => label(r.tool));
      const fail = results.filter((r) => !r.ok);
      if (ok.length && !fail.length) {
        toast.show(t('my.toast.copiedTo', { tools: ok.join(', ') }));
      } else if (fail.length) {
        const okPart = ok.length ? t('my.toast.copiedTo', { tools: ok.join(', ') }) : '';
        const failPart = fail
          .map((r) => t('my.toast.failedDetail', { tool: label(r.tool), error: r.error ?? t('my.toast.failFallback') }))
          .join('; ');
        toast.show([okPart, failPart].filter(Boolean).join('; '), 'error', 4000);
      }
      await refresh();
      onChanged();
      setGlobalTarget(null);
    } catch (e: any) {
      toast.show(t('my.toast.copyFail', { error: e?.message ?? e }), 'error');
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
        parts.push(t('my.toast.cleanedLinks', { tools: r.removedLinks.map((tl) => label(tl)).join(', ') }));
      }
      if (r.leftCopies.length) {
        parts.push(t('my.toast.leftCopies', { tools: r.leftCopies.map((tl) => label(tl)).join(', ') }));
      }
      toast.show(parts.join('; '), 'info', 5000);
      await refresh();
      onChanged();
    } catch (e: any) {
      toast.show(t('my.toast.removeFail', { error: e?.message ?? e }), 'error');
    }
  }

  // 渲染一张全局仓 skill 卡片（全局仓 chip + 「全部」并入的 globalOnly 共用）
  const renderGlobalCard = (g: GlobalRepoSkill) => (
    <GlobalRepoCard
      key={g.path}
      skill={g}
      mode={mode}
      selection={rowSelection(`global:${g.path}`, g.name)}
      onReveal={(s) => void window.skillkit.revealInFinder(s.path)}
      onRemove={(s) => {
        if (confirm(t('my.confirm.removeGlobal', { name: s.name }))) {
          void doRemoveGlobal(s);
        }
      }}
      onCopyTo={setGlobalTarget}
      // 分享按 InstalledSkill 形状传给 ShareDialog（tool=global → 走 share:createGlobal 管线）
      onShare={(s) =>
        setShareSkill({
          tool: GLOBAL_TOOL,
          name: s.name,
          description: s.description,
          path: s.path,
          isBuiltin: false,
          sizeBytes: s.sizeBytes,
          mtime: s.mtime,
          source: null,
          installedAt: null,
        })
      }
      onOpenDetail={(s) => setDetail(skillDetailFromGlobalRepo(s))}
    />
  );

  // 顶部统一工具栏控件（搜索 / 视图切换 / 重新扫描）-> portal 进 TopBar 槽位
  const toolbar = (
    <>
      <div
        className="search-toggle"
        data-expanded={searchExpanded}
        ref={searchRef}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || hasFilters || filterMenuRef.current?.contains(e.target as Node)) return;
          searchButtonRef.current?.focus();
          setSearchOpen(false);
        }}
      >
        <button
          type="button"
          className="search-toggle-ico"
          ref={searchButtonRef}
          aria-label={t('my.searchTitle')}
          aria-expanded={searchExpanded}
          title={t('my.searchTitle')}
          onClick={() => {
            setSearchOpen(true);
            searchInputRef.current?.focus();
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M10 4a6 6 0 014.47 9.97l4.78 4.78-1.5 1.5-4.78-4.78A6 6 0 1110 4zm0 2a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
        </button>
        <input
          ref={searchInputRef}
          tabIndex={searchExpanded ? 0 : -1}
          aria-hidden={!searchExpanded}
          aria-label={t('my.searchTitle')}
          placeholder={t('my.searchPlaceholder')}
          value={q}
          onFocus={() => setSearchOpen(true)}
          onChange={(e) => setQ(e.target.value)}
        />
        {searchExpanded && (
          <DropdownMenu.Root
            modal={false}
            onOpenChange={(open) => {
              if (open) setSearchOpen(true);
            }}
          >
            <DropdownMenu.Trigger
              type="button"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'mr-0.5 h-7 gap-1 rounded-full hover:bg-primary/10 hover:text-foreground dark:hover:bg-primary/10 data-[filtered=true]:text-accent data-[state=open]:bg-primary/10',
              )}
              aria-label={t('my.filter.title')}
              title={t('my.filter.title')}
              data-filtered={updateFilter !== 'all'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M21 4h-7m-4 0H3m18 8h-9m-4 0H3m18 8h-5m-4 0H3M14 2v4M8 10v4m8 4v4" />
              </svg>
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                ref={filterMenuRef}
                align="end"
                sideOffset={6}
                className="z-30 min-w-32 rounded-xl border border-solid border-border bg-popover p-1.5 text-sm text-popover-foreground shadow-md"
              >
                <DropdownMenu.RadioGroup value={updateFilter} aria-label={t('my.filter.title')}>
                  {updateFilters.map(({ value, label }) => (
                    <DropdownMenu.RadioItem
                      key={value}
                      value={value}
                      onSelect={() => setUpdateFilter(value)}
                      className="relative cursor-default rounded-md py-1.5 pr-3 pl-7 outline-none data-[state=checked]:bg-primary/10 data-[highlighted]:bg-primary/20"
                    >
                      <DropdownMenu.ItemIndicator className="absolute top-1/2 left-2 inline-flex -translate-y-1/2">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m20 6-11 11-5-5" />
                        </svg>
                      </DropdownMenu.ItemIndicator>
                      {t(label)}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
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
        data-tip={scanning ? '' : t('my.rescanTip')}
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
            {t('my.chipAll', { count: groups.length + globalOnly.length })}
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
              <img className="chip-ico" src={icon(tl)} alt="" draggable={false} />
              {t('my.chipTool', { label: label(tl), count: counts[tl] })}
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

      {mode === 'list' && rowIds.length > 0 && (
        <div className="flex min-h-9 items-center gap-3 px-4 text-sm">
          <label className="inline-flex cursor-pointer items-center gap-3">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="size-4 shrink-0 cursor-pointer accent-[var(--accent)]"
              aria-label={t('my.batch.selectAll')}
              checked={allSelected}
              onChange={() => setSelection(allSelected ? new Set() : new Set(rowIds))}
            />
            <span>{selectedCount ? t('my.batch.selected', { count: selectedCount }) : t('my.batch.selectAll')}</span>
          </label>
          {selectedCount > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!copyJobs.length}
                onClick={() => setBatch({ action: 'copy', jobs: copyJobs })}>
                {t('my.batch.copy')}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={!uninstallJobs.length}
                onClick={() => setBatch({ action: 'uninstall', jobs: uninstallJobs })}>
                {t('my.batch.uninstall')}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="skills" data-mode={mode}>
        {tool === 'global' ? (
          globalSkills == null ? (
            <div className="empty"><span className="spinner" /> {t('my.empty.scanningGlobal')}</div>
          ) : filteredGlobal.length === 0 ? (
            <div className="empty">
              {hasFilters ? t('my.empty.noMatch') : t('my.empty.globalEmpty')}
            </div>
          ) : (
            filteredGlobal.map(renderGlobalCard)
          )
        ) : items == null ? (
          <div className="empty"><span className="spinner" /> {t('my.empty.scanningTools')}</div>
        ) : filtered.length === 0 && (tool !== 'all' || globalOnlyFiltered.length === 0) ? (
          <div className="empty">{hasFilters ? t('my.empty.noMatch') : t('my.empty.filteredEmpty')}</div>
        ) : (
          <>
            {filtered.map((g) => (
              <SkillCard
                key={g.name}
                group={g}
                mode={mode}
                selection={rowSelection(`installed:${g.name}`, g.name)}
                updateStatus={updateFilter === 'all' ? updateStatusOf(g) : updateFilter}
                onUninstall={startUninstall}
                onReveal={startReveal}
                onShare={(grp) => setShareSkill(grp.primary)}
                onCopyTo={g.tools.length < allTools.length ? setCopyGroup : undefined}
                onUpdate={updateStatusOf(g) === 'update_available' ? startUpdate : undefined}
                onOpenDetail={(grp) => setDetail(skillDetailFromGroup(grp))}
              />
            ))}
            {/* 「全部」chip 一并展示全局仓独有（未链接进任何工具）的 skill */}
            {tool === 'all' && globalOnlyFiltered.map(renderGlobalCard)}
          </>
        )}
      </div>

      {batch && (
        <SkillBatchDialog
          action={batch.action}
          jobs={batch.jobs}
          onCancel={() => setBatch(null)}
          onFinished={async () => {
            setSelection(new Set());
            await refresh();
          }}
        />
      )}

      <ShareDialog
        open={!!shareSkill}
        skill={shareSkill}
        onClose={() => setShareSkill(null)}
      />

      <SkillDetailModal
        open={!!detail}
        detail={detail}
        onClose={() => setDetail(null)}
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
          uninstallGroup ? allTools.filter((tool) => !uninstallGroup.tools.includes(tool)) : []
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
        installTargets
        title={copyGroup ? t('my.picker.copyTitle', { name: copyGroup.name }) : undefined}
        subtitle={
          copyGroup
            ? t('my.picker.copySubtitle', { tool: label(copyGroup.primary.tool) })
            : ''
        }
        defaultSelected={
          copyGroup
            ? (localTools.filter((tool) => !copyGroup.tools.includes(tool)).slice(0, 1) as Tool[])
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
          revealGroup ? allTools.filter((tool) => !revealGroup.tools.includes(tool)) : []
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

      {/* 全局仓库 -> 复制到其他工具（与 skill 卡复制弹窗同一套文案；锁定全局范围；默认软链；目标筛选同口径）*/}
      <ToolPicker
        open={!!globalTarget}
        lockedScope="global"
        installTargets
        title={globalTarget ? t('my.picker.copyTitle', { name: globalTarget.name }) : undefined}
        subtitle={t('my.picker.copySubtitle', { tool: t('space.globalRepo') })}
        busy={installingGlobal}
        confirmLabel={t('my.picker.copyConfirm')}
        busyLabel={t('my.picker.copyBusy')}
        onCancel={() => !installingGlobal && setGlobalTarget(null)}
        onConfirm={(targets, opts) => {
          void handleInstallGlobalTo(targets, opts.method ?? 'symlink');
        }}
      />
    </section>
  );
}
