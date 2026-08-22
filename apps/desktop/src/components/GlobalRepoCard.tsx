import type { GlobalRepoSkill } from '@shared/types';
import { emojiFor, formatSize, formatTime } from '../lib/format';
import SkillCardShell from './SkillCardShell';
import type { KebabItem } from './KebabMenu';
import { useI18n } from '../i18n';

interface Props {
  skill: GlobalRepoSkill;
  mode: 'grid' | 'list';
  onReveal?: (skill: GlobalRepoSkill) => void;
  onRemove?: (skill: GlobalRepoSkill) => void;
  onCopyTo?: (skill: GlobalRepoSkill) => void;
  onShare?: (skill: GlobalRepoSkill) => void;
  onOpenDetail?: (skill: GlobalRepoSkill) => void;
}

/** 全局仓库（~/.agents/skills）skill 卡片：把 GlobalRepoSkill 映射进 SkillCardShell，与「全部」视图同一套布局与 kebab。 */
export default function GlobalRepoCard({ skill, mode, onReveal, onRemove, onCopyTo, onShare, onOpenDetail }: Props) {
  const { t } = useI18n();
  const reveal = () => onReveal?.(skill);
  const copyTo = () => onCopyTo?.(skill);
  const share = onShare ? () => onShare(skill) : undefined;
  const remove = () => onRemove?.(skill);

  // kebab 菜单项（与 SkillCard 同一 KebabMenu/icon，顺序同约定：打开目录 → 分享 → 复制到其他工具 → 移除）
  const kebabItems: KebabItem[] = [
    { key: 'reveal', icon: 'folder', label: t('skill.openDir'), onSelect: reveal },
    ...(share ? [{ key: 'share', icon: 'share' as const, label: t('skill.share'), onSelect: share }] : []),
    { key: 'copy', icon: 'copy', label: t('skill.copyTo'), onSelect: copyTo },
    { key: 'remove', icon: 'trash', danger: true, label: t('skill.remove'), onSelect: remove },
  ];

  return (
    <SkillCardShell
      mode={mode}
      name={skill.name}
      description={skill.description || t('skill.noDesc')}
      icon={emojiFor(skill.name)}
      meta={
        <>
          {skill.sizeBytes != null && (
            <>
              <span>{formatSize(skill.sizeBytes)}</span>
              <span className="dot" />
            </>
          )}
          {skill.mtime != null && (
            <>
              <span>{t('skill.updated', { time: formatTime(skill.mtime) })}</span>
              <span className="dot" />
            </>
          )}
          <span
            title={skill.path}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}
          >
            {skill.path}
          </span>
        </>
      }
      kebabItems={kebabItems}
      onOpenDetail={onOpenDetail ? () => onOpenDetail(skill) : undefined}
    />
  );
}
