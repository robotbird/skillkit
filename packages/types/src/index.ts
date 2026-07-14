// 跨端共享类型与常量(desktop 主进程/渲染层 + server 共用)。
// desktop 专用的 IPC 契约(SkillkitApi)与自动更新类型(UpdateAvailableInfo)不在此处,
// 留在 apps/desktop 内。

// 短 key（skillkit 内部/DB/分享协议）。与 npx skills 的 --agent 名可能不同（如 claude ≠ claude-code）。
export type Tool =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'trae'
  | 'workbuddy'
  | 'qoder'
  | 'grok'
  | 'opencode'
  | 'gemini'
  | 'antigravity'
  | 'windsurf'
  | 'augment'
  | 'codebuddy'
  | 'pi'
  | 'kiro'
  | 'hermes'
  | 'openclaw'
  | 'cline'
  | 'warp'
  | 'kimi';

export const TOOL_LABELS: Record<Tool, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  trae: 'Trae',
  workbuddy: 'Workbuddy',
  qoder: 'Qoder',
  grok: 'Grok',
  opencode: 'OpenCode',
  gemini: 'Gemini CLI',
  antigravity: 'Antigravity',
  windsurf: 'Windsurf',
  augment: 'Augment',
  codebuddy: 'CodeBuddy',
  pi: 'Pi',
  kiro: 'Kiro CLI',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  cline: 'Cline',
  warp: 'Warp',
  kimi: 'Kimi Code CLI',
};

/** UI / 扫描顺序：现有工具在前，其余按常用度与字母大致排列。 */
export const ALL_TOOLS: Tool[] = [
  'claude',
  'codex',
  'cursor',
  'trae',
  'workbuddy',
  'qoder',
  'grok',
  'opencode',
  'gemini',
  'antigravity',
  'windsurf',
  'augment',
  'codebuddy',
  'pi',
  'kiro',
  'hermes',
  'openclaw',
  'cline',
  'warp',
  'kimi',
];

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
  warn?: string; // 非致命提示，如 Windows 软链不可用已退回拷贝
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
// sourceUrl: 链接型分享的外部跳转地址(目前仅 GitHub 仓库 URL)。
//   - 链接型(有 sourceUrl、无 zip):分享短链打开后跳转到该 URL,不上传 skill 包。
//   - zip 型(sourceUrl=null):既有行为,下载安装 skill 包。
export interface ShareMeta {
  id: string;
  name: string;
  description: string | null;
  sourceTool: Tool;
  sizeBytes: number;
  createdAt: number;
  expiresAt: number;
  sourceUrl?: string | null;
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

// 当前用户的分享列表项(个人中心「分享的 skill」用)。
// 与 ShareMeta 区别:带 url(完整短链)、不含 description;userId 不外泄。
export interface MyShare {
  id: string;
  name: string;
  sourceTool: Tool;
  sizeBytes: number;
  createdAt: number; // epoch ms
  expiresAt: number; // epoch ms
  url: string; // /share/<id> 完整链接
  sourceUrl?: string | null; // 链接型分享的 GitHub 跳转地址;null=zip 型
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

// 桌面端 token 鉴权：/api/auth/token 登录成功后下发 bearer token + 用户。
// 与 web 的 cookie session 复用同一套 JWT（signSession）+ tokenVersion 失效机制，
// 只是 token 走响应体给桌面端自行存储，不写 cookie。
export interface TokenAuthResponse {
  token: string;
  user: PublicUser;
}
export interface UpdateMeRequest {
  name?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ===== 第三方登录（OAuth）=====
// 支持的 OAuth provider。桌面端 / web 登录页用同一组。
export type OAuthProvider = 'github' | 'google';

// 桌面端 OAuth 回调换取长期 token：桌面端通过 skillkit:// 深链拿到一次性 code，
// POST /api/auth/exchange 换回与邮箱登录同一套 TokenAuthResponse（token + user）。
// code 由服务端 OAuth 成功后写入 DesktopAuthTicket（60s、单次消费），长期凭据不进 URL。
export interface DesktopExchangeRequest {
  code: string;
}
