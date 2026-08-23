import { useEffect, useRef, useState } from 'react';
import type { SkillUpdateState, SkillUpdateSummary, Tool } from '@shared/types';
import type { ToastState } from './Toast';
import { useI18n } from '../i18n';

/** 统计状态表里有多少 skill 标记为「可更新」。 */
function countAvailable(m: Record<string, SkillUpdateState>): number {
  let n = 0;
  for (const k in m) if (m[k].updateStatus === 'update_available') n++;
  return n;
}

/**
 * 顶部「Skill 更新」按钮（UpdateButton 的兄弟）。
 * 挂载时取一次当前可更新数量（覆盖启动期 1 分钟自动检测的结果），并监听后续检测完成事件。
 * 无可更新：点击 force 触发一轮检测；检测到可更新时显示数量徽章，
 * hover 由圆形展开为「更新全部」胶囊，点击把所有可更新 skill 一键更新。
 */
export default function SkillUpdateButton({
  toast,
  onChanged,
}: {
  toast: ToastState;
  /** 更新完成后通知外层刷新「我的 Skill」（重挂载重扫）。 */
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [available, setAvailable] = useState(0);
  const updatingRef = useRef(false);
  const busy = checking || updating;

  useEffect(() => {
    window.skillkit
      .getSkillUpdateMap()
      .then((m) => setAvailable(countAvailable(m)))
      .catch(() => {});
    window.skillkit.onSkillUpdatesChecked((s: SkillUpdateSummary) => {
      setChecking(false);
      // 更新进行中不覆盖徽章（更新结束后会重拉状态表）
      if (!updatingRef.current) setAvailable(s.available);
    });
  }, []);

  async function onClick() {
    if (busy) return;
    if (available > 0) return updateAll();
    setChecking(true);
    try {
      const s = await window.skillkit.checkSkillUpdates(true);
      setAvailable(s.available);
    } catch {
      // 忽略：检测失败不弹错（卡片上会标 error）
    } finally {
      setChecking(false);
    }
  }

  /**
   * 把状态表里所有「可更新」的 skill 逐个应用更新（同名跨工具算一组，applySkillUpdate 自会整组重装）。
   * 每个 skill 一条安装记录（channel=update，含各工具错误明细）；单个失败不中断，跳过继续下一个。
   */
  async function updateAll() {
    setUpdating(true);
    updatingRef.current = true;
    try {
      const map = await window.skillkit.getSkillUpdateMap();
      // 按 name 去重、按 key 排序保证更新顺序稳定
      const seen = new Set<string>();
      const jobs: { tool: Tool; name: string }[] = [];
      for (const key of Object.keys(map).sort()) {
        const st = map[key];
        if (st.updateStatus !== 'update_available' || seen.has(st.name)) continue;
        seen.add(st.name);
        jobs.push({ tool: st.tool, name: st.name });
      }
      let ok = 0;
      const failed: string[] = []; // "name（失败原因）"
      for (const j of jobs) {
        try {
          const rs = await window.skillkit.applySkillUpdate(j.tool, j.name);
          if (rs.some((r) => r.ok)) {
            ok++;
            continue;
          }
          const why = [...new Set(rs.filter((r) => !r.ok).map((r) => r.error).filter(Boolean))].join('；');
          failed.push(`${j.name}（${why || t('my.toast.failFallback')}）`);
        } catch (e: any) {
          failed.push(`${j.name}（${e?.message ?? t('my.toast.failFallback')}）`);
        }
      }
      if (failed.length) {
        toast.show(
          t('skillUpdate.updateAllPartial', { ok, fail: failed.length, names: failed.join('；') }),
          'error',
          6000,
        );
      } else if (jobs.length) {
        toast.show(t('skillUpdate.updateAllDone', { count: ok }));
      }
      // 重拉状态刷徽章 + 通知外层重扫「我的 Skill」列表
      window.skillkit
        .getSkillUpdateMap()
        .then((m) => setAvailable(countAvailable(m)))
        .catch(() => {});
      onChanged?.();
    } finally {
      setUpdating(false);
      updatingRef.current = false;
    }
  }

  const title = busy
    ? updating
      ? t('skillUpdate.updatingAll')
      : t('skillUpdate.checking')
    : available > 0
      ? t('skillUpdate.availableCount', { count: available })
      : t('skillUpdate.allUpToDate');

  return (
    <button
      className={`skill-update-btn${busy ? ' is-checking' : ''}${available > 0 ? ' has-badge' : ''}`}
      data-tip={title}
      aria-label={title}
      onClick={onClick}
      disabled={busy}
    >
      <span className="skill-update-ico">
        {busy ? (
          <span className="spinner" />
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
            />
          </svg>
        )}
      </span>
      {available > 0 && !busy && (
        <>
          <span className="skill-update-badge">{available > 99 ? '99+' : available}</span>
          <span className="skill-update-label">{t('skillUpdate.updateAll')}</span>
        </>
      )}
    </button>
  );
}
