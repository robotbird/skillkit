// 主进程 / 渲染进程共享类型
export type Tool = 'claude' | 'codex' | 'cursor' | 'trae';

export const TOOL_LABELS: Record<Tool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  trae: 'Trae',
};

export const ALL_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae'];

export interface InstalledSkill {
  tool: Tool;
  name: string;
  description: string | null;
  path: string;
  isBuiltin: boolean;
  sizeBytes: number | null;
  mtime: number | null;
  source: string | null;
  installedAt: number | null;
}

export interface MarketSkill {
  slug: string; // owner/repo/name
  owner: string;
  repo: string;
  name: string;
  description: string | null;
  detailFetchedAt: number | null;
  isOfficial: boolean;
}

export interface InstallResult {
  tool: Tool;
  ok: boolean;
  path?: string;
  error?: string;
}

export interface MarketRefreshResult {
  count: number;
  fetched: boolean; // 是否真正请求了 sitemap
}

export interface MarketListQuery {
  q?: string;
  owner?: string;
  page?: number;
  pageSize?: number;
}

export interface MarketListResult {
  items: MarketSkill[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InstalledFilter {
  tool?: Tool;
  q?: string;
}

// preload 暴露在 window.skillzix 上的类型
export interface SkillzixApi {
  scanAll(): Promise<InstalledSkill[]>;
  listInstalled(filter?: InstalledFilter): Promise<InstalledSkill[]>;
  uninstallSkill(tool: Tool, name: string): Promise<void>;
  revealInFinder(absPath: string): Promise<void>;

  marketRefresh(force?: boolean): Promise<MarketRefreshResult>;
  marketList(query?: MarketListQuery): Promise<MarketListResult>;
  marketDetail(slug: string): Promise<{ description: string | null }>;

  installFromMarket(slug: string, targets: Tool[]): Promise<InstallResult[]>;
  installFromGithub(url: string, targets: Tool[]): Promise<InstallResult[]>;
  pickAndInstallZip(targets: Tool[]): Promise<InstallResult[] | null>;
}

declare global {
  interface Window {
    skillzix: SkillzixApi;
  }
}
