import type { SkillGroup } from '../lib/groupSkills';
import type { SkillUpdateStatus } from '@shared/types';
import { emojiFor, formatSize, formatTime } from '../lib/format';
import ToolStack from './ToolStack';
import SkillCardShell from './SkillCardShell';
import type { KebabItem } from './KebabMenu';
import { useI18n } from '../i18n';

interface Props {
  group: SkillGroup;
  mode: 'grid' | 'list';
  /** 该 skill 的更新状态（来自 skill_update_state）。update_available 时显示「可更新」徽章。 */
  updateStatus?: SkillUpdateStatus;
  onUninstall?: (group: SkillGroup) => void;
  onReveal?: (group: SkillGroup) => void;
  onShare?: (group: SkillGroup) => void;
  onCopyTo?: (group: SkillGroup) => void;
  /** 应用更新（重装到本组所有工具）。仅 update_available 时传入。 */
  onUpdate?: (group: SkillGroup) => void;
  onOpenDetail?: (group: SkillGroup) => void;
}

/** 「全部」/ 单工具视图的 skill 卡片：把 SkillGroup 映射进 SkillCardShell（布局与 kebab 在壳里，与全局仓共用一套）。 */
export default function SkillCard({ group, mode, updateStatus, onUninstall, onReveal, onShare, onCopyTo, onUpdate, onOpenDetail }: Props) {
  const { t } = useI18n();
  const { primary, tools } = group;
  const builtinTools = tools.filter((tool) => group.byTool[tool]?.isBuiltin);
  // 项目类型 skill 的 tool 是项目 custom id，但应显示其所在内置 agent 的 icon：把 tool 映射成
  // agent（无 agent 的保留原 tool）。仅用于 ToolStack 图标展示；卸载/复制/分享仍走真实 tool。
  const displayTools = Array.from(new Set(tools.map((t) => group.byTool[t]?.agent ?? t)));
  const multi = tools.length > 1;
  // 只要有一个非内置工具就允许卸载（弹窗里再按工具勾选，内置会置灰）
  const canUninstall = tools.some((tool) => !group.byTool[tool]?.isBuiltin);
  const updatable = updateStatus === 'update_available';

  const reveal = () => onReveal?.(group);
  const uninstall = () => onUninstall?.(group);
  const share = onShare ? () => onShare(group) : undefined;
  const copyTo = onCopyTo ? () => onCopyTo(group) : undefined;
  const update = updatable && onUpdate ? () => onUpdate(group) : undefined;

  // kebab 菜单项（顺序即约定：更新 → 打开目录 → 分享 → 复制到其他工具 → 卸载）
  const kebabItems: KebabItem[] = [
    ...(update ? [{ key: 'update', icon: 'update' as const, label: t('skill.update'), onSelect: update }] : []),
    { key: 'reveal', icon: 'folder', label: t('skill.openDir'), onSelect: reveal },
    ...(share ? [{ key: 'share', icon: 'share' as const, label: t('skill.share'), onSelect: share }] : []),
    ...(copyTo ? [{ key: 'copy', icon: 'copy' as const, label: t('skill.copyTo'), onSelect: copyTo }] : []),
    {
      key: 'uninstall',
      icon: 'trash',
      danger: true,
      disabled: !canUninstall,
      label: canUninstall ? t('skill.uninstall') : t('skill.allBuiltin'),
      onSelect: uninstall,
    },
  ];

  return (
    <SkillCardShell
      mode={mode}
      name={group.name}
      description={primary.description || t('skill.noDesc')}
      icon={emojiFor(group.name)}
      headerExtras={
        <>
          {updatable && <span className="skill-tag tag-update">{t('skill.updateAvailable')}</span>}
          <ToolStack tools={displayTools} builtinTools={builtinTools} />
        </>
      }
      rowExtras={
        <>
          <ToolStack tools={displayTools} builtinTools={builtinTools} size="md" />
          {updatable && <span className="skill-tag tag-update">{t('skill.updateAvailable')}</span>}
          {multi && <span className="skill-tag tag-multi">{t('skill.toolCount', { count: tools.length })}</span>}
          {builtinTools.length > 0 && <span className="skill-tag tag-builtin">{t('skill.hasBuiltin')}</span>}
        </>
      }
      meta={
        <>
          {primary.sizeBytes != null && (
            <>
              <span>{formatSize(primary.sizeBytes)}</span>
              <span className="dot" />
            </>
          )}
          {primary.mtime != null && (
            <>
              <span>{t('skill.updated', { time: formatTime(primary.mtime) })}</span>
              <span className="dot" />
            </>
          )}
          <span
            title={primary.path}
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
          >
            {primary.path.replace(/^.*\/(\.[^/]+\/)/, '~/$1')}
          </span>
        </>
      }
      kebabItems={kebabItems}
      onOpenDetail={onOpenDetail ? () => onOpenDetail(group) : undefined}
    />
  );
}
