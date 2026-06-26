// 主进程 / 渲染进程共享类型
export type Tool = 'claude' | 'codex' | 'cursor' | 'trae' | 'workbuddy';

export const TOOL_LABELS: Record<Tool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  trae: 'Trae',
  workbuddy: 'Workbuddy',
};

export const ALL_TOOLS: Tool[] = ['claude', 'codex', 'cursor', 'trae', 'workbuddy'];

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

// 分享服务的基地址。默认指向云端；本地开发可用 SKILLKIT_SHARE_BASE_URL 覆盖（如 http://127.0.0.1:8787）
export const SHARE_BASE_URL =
  (typeof process !== 'undefined' &&
    (process.env?.SKILLKIT_SHARE_BASE_URL || process.env?.SKILLZIX_SHARE_BASE_URL)) ||
  'https://skillkit.net';

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 4MB:适配 Vercel 函数 4.5MB 请求体硬限制(阿里云本可更大,这里取两端都安全的值)
export const SHARE_MAX_BYTES = 4 * 1024 * 1024;

// preload 暴露在 window.skillkit 上的类型
export interface SkillkitApi {
  scanAll(): Promise<InstalledSkill[]>;
  listInstalled(filter?: InstalledFilter): Promise<InstalledSkill[]>;
  uninstallSkill(tool: Tool, name: string): Promise<void>;
  revealInFinder(absPath: string): Promise<void>;
  copyToTools(sourceTool: Tool, name: string, targets: Tool[]): Promise<InstallResult[]>;

  marketRefresh(force?: boolean): Promise<MarketRefreshResult>;
  marketList(query?: MarketListQuery): Promise<MarketListResult>;
  marketDetail(slug: string): Promise<{ description: string | null }>;

  installFromMarket(slug: string, targets: Tool[]): Promise<InstallResult[]>;
  installFromGithub(url: string, targets: Tool[]): Promise<InstallResult[]>;
  pickAndInstallZip(targets: Tool[]): Promise<InstallResult[] | null>;

  shareSkill(tool: Tool, name: string): Promise<ShareCreateResult>;
  inspectShare(input: string): Promise<ShareSourceInfo>;
  installFromShare(input: string, targets: Tool[]): Promise<InstallResult[]>;

  // 分享页深链（skillkit://share/<id>）唤起应用时，主进程通过它把 share id 推给渲染进程
  onDeepLink(cb: (input: string) => void): void;
}

declare global {
  interface Window {
    skillkit: SkillkitApi;
  }
}
