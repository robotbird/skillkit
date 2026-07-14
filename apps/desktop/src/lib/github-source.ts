// 解析 InstalledSkill.source 中的 GitHub 来源标签（与 electron/share.ts 的 parseGithubSource 同逻辑）。
// 标签形如 `github:https://github.com/<owner>/<repo>[/tree/<branch>/<subpath>]`（由 installer 归一化写入）。
import type { InstalledSkill } from '@shared/types';

export interface GithubSource {
  url: string;
  owner: string;
  repo: string;
  subpath?: string;
}

export function parseGithubSource(
  source: string | null | undefined,
): GithubSource | null {
  if (!source?.startsWith('github:')) return null;
  const url = source.slice('github:'.length).trim();
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)(?:\/tree\/[^/]+\/(.+))?/);
  if (!m) return null;
  return { url, owner: m[1], repo: m[2].replace(/\.git$/, ''), subpath: m[3] };
}

/** 取 skill 的 GitHub 来源；非 GitHub 返回 null。 */
export function githubSourceOf(skill: Pick<InstalledSkill, 'source'>): GithubSource | null {
  return parseGithubSource(skill.source);
}

/** 短显示：owner/repo（+ subpath 尾段）。 */
export function githubShortLabel(gh: GithubSource): string {
  const tail = gh.subpath ? `/${gh.subpath.split('/').pop()}` : '';
  return `${gh.owner}/${gh.repo}${tail}`;
}
