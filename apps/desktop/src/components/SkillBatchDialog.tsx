import { useState } from 'react';
import { Dialog } from 'radix-ui';
import type { GlobalRepoSkill, Tool } from '@shared/types';
import { useI18n } from '../i18n';
import type { SkillGroup } from '../lib/groupSkills';
import { toolLabel } from '../lib/toolCatalog';
import { Button } from './ui/button';
import ToolCheckRow from './ToolCheckRow';

export type BatchAction = 'copy' | 'uninstall';
export type BatchSkill =
  | { kind: 'installed'; group: SkillGroup }
  | { kind: 'global'; skill: GlobalRepoSkill; installedTools: Tool[] };

interface BatchJob {
  name: string;
  source: Tool | null;
  targets: Tool[];
}

export function planSkillBatch(
  skills: BatchSkill[],
  action: BatchAction,
  scope: Tool | null,
  copyTargets: Tool[],
): BatchJob[] {
  return skills.flatMap<BatchJob>((entry) => {
    if (entry.kind === 'global') {
      if (action === 'uninstall') return [];
      const targets = copyTargets.filter((tool) => !entry.installedTools.includes(tool));
      return targets.length ? [{ name: entry.skill.name, source: null, targets }] : [];
    }

    const { group } = entry;
    const targets = action === 'copy'
      ? copyTargets.filter((tool) => !group.tools.includes(tool))
      : group.tools.filter((tool) => (!scope || scope === tool) && !group.byTool[tool]?.isBuiltin);
    return targets.length ? [{
      name: group.name,
      source: scope ?? group.primary.tool,
      targets,
    }] : [];
  });
}

interface BatchFailure {
  name: string;
  tool: Tool;
  error?: string;
}

export default function SkillBatchDialog({
  action,
  jobs,
  onCancel,
  onFinished,
}: {
  action: BatchAction;
  jobs: BatchJob[];
  onCancel: () => void;
  onFinished: () => Promise<void>;
}) {
  const { t } = useI18n();
  const toolCounts = new Map<Tool, number>();
  for (const { targets } of jobs) {
    for (const tool of targets) toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
  }
  const [picked, setPicked] = useState(() => new Set(action === 'uninstall' ? toolCounts.keys() : []));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; failures: BatchFailure[] } | null>(null);
  const pending = jobs
    .map((job) => ({ ...job, targets: job.targets.filter((tool) => picked.has(tool)) }))
    .filter((job) => job.targets.length > 0);
  const targetCount = pending.reduce((count, job) => count + job.targets.length, 0);

  function toggleTool(tool: Tool) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  }

  async function run() {
    if (busy || !targetCount) return;
    setBusy(true);
    let ok = 0;
    const failures: BatchFailure[] = [];
    try {
      for (const { name, source, targets } of pending) {
        if (action === 'uninstall') {
          for (const tool of targets) {
            try {
              await window.skillkit.uninstallSkill(tool, name);
              ok++;
            } catch (error) {
              failures.push({ name, tool, error: error instanceof Error ? error.message : String(error) });
            }
          }
          continue;
        }

        try {
          const response = source === null
            ? await window.skillkit.installGlobalToTools(name, targets, 'symlink', true)
            : await window.skillkit.copyToTools(source, name, targets, true);
          for (const tool of targets) {
            const target = response.find((item) => item.tool === tool);
            if (target?.ok) ok++;
            else failures.push({ name, tool, error: target?.error });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          for (const tool of targets) failures.push({ name, tool, error: message });
        }
      }
      setResult({ ok, failures });
      await onFinished();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-mask">
          <Dialog.Content
            className="modal log-modal"
            onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
            onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
          >
            <Dialog.Title asChild>
              <h3>{t(action === 'copy' ? 'my.batch.copy' : 'my.batch.uninstall')}</h3>
            </Dialog.Title>
            <Dialog.Description className="modal-sub" aria-live="polite">
              {result
                ? t('my.batch.result', { ok: result.ok, failed: result.failures.length })
                : t(action === 'copy' ? 'my.batch.copyHint' : 'my.batch.uninstallHint')}
            </Dialog.Description>
            <div className="log-modal-body">
              {result ? (
                <ul className="log-modal-targets">
                  {result.failures.map(({ name, tool, error }, index) => (
                    <li key={index} className="log-target is-fail">
                      <div className="min-w-0">
                        <div className="font-medium">{name} · {toolLabel(tool)}</div>
                        <div className="log-target-detail log-target-error">{error || t('inst.records.missingError')}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="opts opts-tools">
                  {[...toolCounts].map(([tool, count]) => (
                    <ToolCheckRow
                      key={tool}
                      tool={tool}
                      checked={picked.has(tool)}
                      note={t('my.batch.toolCount', { count })}
                      parentBusy={busy}
                      onToggle={toggleTool}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions items-center">
              {result ? (
                <Button disabled={busy} onClick={onCancel}>{t('common.close')}</Button>
              ) : (
                <>
                  <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
                    {t('my.batch.summary', { skills: pending.length, targets: targetCount })}
                  </span>
                  <Button variant="ghost" disabled={busy} onClick={onCancel}>{t('common.cancel')}</Button>
                  <Button
                    variant={action === 'uninstall' ? 'destructive' : 'default'}
                    disabled={busy || !targetCount}
                    onClick={() => void run()}
                  >
                    {busy && <span className="spinner" />}
                    {action === 'copy'
                      ? t(busy ? 'my.picker.copyBusy' : 'my.picker.copyConfirm')
                      : t(busy ? 'my.picker.uninstallBusy' : 'my.picker.uninstallConfirm')}
                  </Button>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
