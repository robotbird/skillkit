// 跨端共享类型与常量(desktop 主进程/渲染层 + server 共用)。
// desktop 专用的 IPC 契约(SkillkitApi)与自动更新类型(UpdateAvailableInfo)不在此处,
// 留在 apps/desktop 内。

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

// 分享服务的基地址。默认指向云端;本地开发可用 SKILLKIT_SHARE_BASE_URL 覆盖(如 http://127.0.0.1:3000)
export const SHARE_BASE_URL =
  (typeof process !== 'undefined' &&
    (process.env?.SKILLKIT_SHARE_BASE_URL || process.env?.SKILLZIX_SHARE_BASE_URL)) ||
  'https://skillkit.net';

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 4MB:适配 Vercel 函数 4.5MB 请求体硬限制
export const SHARE_MAX_BYTES = 4 * 1024 * 1024;

// ===== 用户 / 认证 =====
// 对外暴露的用户视图(绝不包含 passwordHash)。server 的 lib/auth 负责 User → PublicUser 映射。
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: number; // epoch ms(与 ShareMeta 风格一致)
}

// JWT payload:userId + tokenVersion(后置用于全设备登出 / 改密失效旧 token)。
export interface AuthSession {
  userId: string;
  v: number;
}

// session cookie 名(前后端共享);有效期(秒)。
export const SESSION_COOKIE = 'skillkit_session';
export const SESSION_TTL_S = 7 * 24 * 3600;

// ===== API DTO =====
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthResponse {
  user: PublicUser;
}
export interface UpdateMeRequest {
  name?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
