import { useEffect, useState } from 'react';
import type { SkillUpdateState, SkillUpdateSummary } from '@shared/types';
import { useI18n } from '../i18n';

/** 统计状态表里有多少 skill 标记为「可更新」。 */
function countAvailable(m: Record<string, SkillUpdateState>): number {
  let n = 0;
  for (const k in m) if (m[k].updateStatus === 'update_available') n++;
  return n;
}

/**
 * 顶部「检查 Skill 更新」按钮（UpdateButton 的兄弟）。
 * 挂载时取一次当前可更新数量（覆盖启动期 1 分钟自动检测的结果），并监听后续检测完成事件。
 * 点击 force 触发一轮检测；检测到可更新时显示数量徽章。
 */
export default function SkillUpdateButton() {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(0);

  useEffect(() => {
    window.skillkit
      .getSkillUpdateMap()
      .then((m) => setAvailable(countAvailable(m)))
      .catch(() => {});
    window.skillkit.onSkillUpdatesChecked((s: SkillUpdateSummary) => {
      setChecking(false);
      setAvailable(s.available);
    });
  }, []);

  async function onClick() {
    if (checking) return;
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

  const title = checking
    ? t('skillUpdate.checking')
    : available > 0
      ? t('skillUpdate.availableCount', { count: available })
      : t('skillUpdate.check');

  return (
    <button
      className={`skill-update-btn${checking ? ' is-checking' : ''}${available > 0 ? ' has-badge' : ''}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={checking}
    >
      {checking ? (
        <span className="spinner" />
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
          />
        </svg>
      )}
      {available > 0 && !checking && (
        <span className="skill-update-badge">{available > 99 ? '99+' : available}</span>
      )}
    </button>
  );
}
