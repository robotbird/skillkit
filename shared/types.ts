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

// ===== 分享 =====
export interface ShareMeta {
  id: string;
  name: string;
  description: string | null;
  sourceTool: Tool;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
}

export interface ShareCreateResult {
  id: string;
  url: string;
  expiresAt: number;
}

export interface ShareSourceInfo {
  meta: ShareMeta;
  exists: boolean; // false 表示已过期 / 不存在
}

// 分享服务的基地址。本地测试用 127.0.0.1；上云时改这里（或读 env）
export const SHARE_BASE_URL =
  (typeof process !== 'undefined' && process.env?.SKILLZIX_SHARE_BASE_URL) ||
  'http://127.0.0.1:8787';

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SHARE_MAX_BYTES = 20 * 1024 * 1024;

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

  shareSkill(tool: Tool, name: string): Promise<ShareCreateResult>;
  inspectShare(input: string): Promise<ShareSourceInfo>;
  installFromShare(input: string, targets: Tool[]): Promise<InstallResult[]>;
}

declare global {
  interface Window {
    skillzix: SkillzixApi;
  }
}
