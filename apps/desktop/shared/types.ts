// desktop 视角的类型集合(桥接层)。
// 跨端符号(Tool / Share 系列 / 常量)统一来自 workspace 包 @skillkit/types —— 单一真相源;
// 这里 re-export 给主进程(electron/)与渲染层(src/)消费,两者分别以 `../shared/types.js`
// 与 `@shared/types` 引用,迁移后路径不变。本文件额外定义 desktop 专用的 IPC 契约与自动更新类型。

export {
  TOOL_LABELS,
  ALL_TOOLS,
  SHARE_BASE_URL,
  SHARE_TTL_MS,
  SHARE_MAX_BYTES,
} from '@skillkit/types';

export type {
  Tool,
  InstalledSkill,
  MarketSkill,
  InstallResult,
  MarketRefreshResult,
  MarketListQuery,
  MarketListResult,
  InstalledFilter,
  ShareMeta,
  ShareCreateResult,
  ShareSourceInfo,
  PublicUser,
  OAuthProvider,
  TokenAuthResponse,
} from '@skillkit/types';

import type {
  Tool,
  InstalledSkill,
  InstalledFilter,
  InstallResult,
  MarketRefreshResult,
  MarketListQuery,
  MarketListResult,
  ShareCreateResult,
  ShareSourceInfo,
  PublicUser,
  OAuthProvider,
} from '@skillkit/types';

// ===== 多 skill 仓库批量安装（GitHub）=====
/** 多 skill 仓库里扫到的一个候选 skill。subpath 为 '' 表示单 skill 仓库根。 */
export interface RepoSkillCandidate {
  name: string;
  description: string | null;
  subpath: string;
}

/** listGithubSkills 的返回。kind==='single' 时走原直装路径，'multi' 时弹 RepoSkillPicker。 */
export interface GithubSkillsResult {
  kind: 'single' | 'multi';
  skills: RepoSkillCandidate[];
  isPlugin: boolean; // 是否检测到 plugin 框架目录（.claude-plugin 等）
  pluginHints: string[]; // 命中的 harness 名，如 ['Claude Code', 'Codex']
  repo: string; // owner/repo，用于 UI 展示与 recent 记录
}

/** 批量安装某个 subpath（=一个 skill）到多个工具的结果。 */
export interface RepoBatchResult {
  subpath: string;
  skillName: string;
  results: InstallResult[]; // 每个 tool 一项
}

// ===== 全局仓库（~/.agents/skills，与 npx skills 互通）=====
/** 安装范围 + 方式。从 ToolPicker 经 IPC 传到 installer。 */
export interface InstallOpts {
  scope: 'tools' | 'global'; // 按工具（当前行为）/ 全局仓库
  method?: 'symlink' | 'copy'; // 仅 scope==='global' 有意义；默认 'symlink'
}

/** 全局仓库 ~/.agents/skills/<name> 下的一条记录。文件系统即真相，不写 DB。 */
export interface GlobalRepoSkill {
  name: string;
  description: string | null;
  path: string; // ~/.agents/skills/<name>
  sizeBytes: number | null;
  mtime: number | null;
}

/** 从全局仓库移除的回执：已清软链 / 残留独立副本（无法判定来源，留待用户处理）。 */
export interface GlobalRepoRemoveResult {
  removedLinks: Tool[];
  leftCopies: Tool[];
}

/** 「我的 skill」详情弹窗读到的 SKILL.md/AGENTS.md 正文（已剥掉开头 frontmatter）。 */
export interface SkillDoc {
  filename: string; // 实际命中的文件名（SKILL.md / AGENTS.md）
  body: string; // 剥掉开头 frontmatter 后的 Markdown 正文
}

// ===== 自动更新(desktop 专用) =====
export interface UpdateAvailableInfo {
  version: string; // 最新版本号(去 v 前缀)
  currentVersion: string; // 当前版本
  releaseUrl: string; // release 页(兜底)
  downloadUrl: string; // 匹配平台/架构的安装包直链
  downloadName: string; // 安装包文件名
}

// ===== 设置（持久化于 desktop 主进程 meta KV；desktop 专用）=====
/** 外观主题。system 跟随 OS。 */
export type Theme = 'dark' | 'light' | 'system';
/** 界面语言。 */
export type Locale = 'zh' | 'en';

/** meta KV 键名。auth_token 存 safeStorage 加密串（降级明文带 `plain:` 前缀）。 */
export const SETTING_KEYS = {
  theme: 'theme',
  locale: 'locale',
  authToken: 'auth_token',
} as const;

/** 主进程解析后的有效主题（system 已解析为 dark/light）。 */
export type EffectiveTheme = 'dark' | 'light';

/** 桌面账号登录结果：成功带 user，失败带 error 文案。 */
export interface AccountLoginResult {
  ok: boolean;
  user?: PublicUser;
  error?: string;
}

// ===== 真身探测结果(desktop 专用) =====
/** 真身探测命中方式：app=应用包 / cli=命令行。未命中为 null。 */
export type ToolDetectVia = 'app' | 'cli';
export interface ToolDetection {
  tool: Tool;
  installed: boolean;
  via: ToolDetectVia | null;
  /** 命中的路径（app 包 / cli 可执行 / 配置目录），未命中为空串。 */
  detail: string;
}

// ===== preload 暴露在 window.skillkit 上的 IPC 契约(desktop 专用) =====
export interface SkillkitApi {
  scanAll(): Promise<InstalledSkill[]>;
  listInstalled(filter?: InstalledFilter): Promise<InstalledSkill[]>;
  /** 已安装工具(其 ~/.<tool> 根目录存在);UI 仅展示/可选这些工具。 */
  installedTools(): Promise<Tool[]>;
  /**
   * 本机已安装的 AI 工具(配置目录存在即可,不要求已有 skill)。
   * 安装页工具网格用:目标工具可能尚无 skill(正要装第一个),故比 installedTools() 更宽。
   */
  installedLocalTools(): Promise<Tool[]>;

  // ===== 自动更新 =====
  /** 监听主进程推送的「发现新版本」事件(检查在后台完成时触发)。 */
  onUpdateAvailable(cb: (info: UpdateAvailableInfo) => void): void;
  /** 查询当前已知的更新状态(渲染进程挂载时用,避免错过启动期推送)。 */
  getUpdateStatus(): Promise<{ available: boolean; info: UpdateAvailableInfo | null }>;
  /** 主动检查更新（实时请求 GitHub releases）。 */
  checkUpdate(): Promise<{ available: boolean; info: UpdateAvailableInfo | null }>;
  /** 触发更新:下载安装包到 ~/Downloads 并打开。 */
  applyUpdate(): Promise<string>;
  uninstallSkill(tool: Tool, name: string): Promise<void>;
  revealInFinder(absPath: string): Promise<void>;
  /** 读取 skill 目录下 SKILL.md/AGENTS.md 的 Markdown 正文（详情弹窗用）。 */
  readSkillMd(skillDir: string): Promise<SkillDoc | null>;
  /** 在系统文件管理器中打开目录（shell.openPath）。 */
  openPath(absPath: string): Promise<void>;
  copyToTools(sourceTool: Tool, name: string, targets: Tool[]): Promise<InstallResult[]>;

  marketRefresh(force?: boolean): Promise<MarketRefreshResult>;
  marketList(query?: MarketListQuery): Promise<MarketListResult>;
  marketDetail(slug: string): Promise<{ description: string | null }>;

  installFromMarket(slug: string, targets: Tool[], opts?: InstallOpts): Promise<InstallResult[]>;
  installFromGithub(url: string, targets: Tool[], opts?: InstallOpts): Promise<InstallResult[]>;
  /** 列举 GitHub 仓库内的 skill 候选（单 skill 仓库返回 kind:'single'）。不安装、不写 DB。 */
  listGithubSkills(url: string): Promise<GithubSkillsResult>;
  /** 批量安装仓库内多个 subpath（skill）到所选工具；装完由 IPC handler 触发 scanAll。 */
  installGithubSkillsAt(
    url: string,
    subpaths: string[],
    targets: Tool[],
    opts?: InstallOpts,
  ): Promise<RepoBatchResult[]>;
  /** 弹系统文件框选 zip，返回绝对路径；取消返回 null（仅选文件，不安装）。 */
  pickZip(): Promise<string | null>;
  /** 用已选 zip 路径安装到目标工具。 */
  installFromZip(zipPath: string, targets: Tool[], opts?: InstallOpts): Promise<InstallResult[]>;

  /** 从拖拽事件的 File 取系统绝对路径（Electron webUtils.getPathForFile）。 */
  getDroppedFilePath(file: File): string;

  shareSkill(tool: Tool, name: string): Promise<ShareCreateResult>;
  /** GitHub 来源 skill 的链接型分享：不上传包，生成跳转到 GitHub 仓库的短链。 */
  shareGithubLink(tool: Tool, name: string): Promise<ShareCreateResult>;
  inspectShare(input: string): Promise<ShareSourceInfo>;
  installFromShare(input: string, targets: Tool[], opts?: InstallOpts): Promise<InstallResult[]>;

  // ===== 全局仓库（~/.agents/skills）=====
  /** 扫描全局仓库下所有 skill（文件系统即真相，不读 DB）。 */
  scanGlobalRepo(): Promise<GlobalRepoSkill[]>;
  /** 从全局仓库移除：删规范副本 + 清来源匹配的工具软链；独立副本保留并在结果里列出。 */
  removeFromGlobalRepo(name: string): Promise<GlobalRepoRemoveResult>;
  /** 把全局仓库中已有 skill 以 软链/拷贝 接入所选工具。 */
  installGlobalToTools(
    name: string,
    targets: Tool[],
    method: 'symlink' | 'copy',
  ): Promise<InstallResult[]>;

  // 分享页深链（skillkit://share/<id>）唤起应用时，主进程通过它把 share id 推给渲染进程
  onDeepLink(cb: (input: string) => void): void;
  // OAuth 回调（skillkit://auth?code=...）换 token 后，主进程通过它把登录结果推给渲染进程
  onOAuthResult(cb: (r: AccountLoginResult) => void): () => void;

  // ===== 设置（meta KV 通用读写）=====
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  // ===== 外观 / 语言 / 版本 / 外链 / 全局仓库路径 =====
  /** 取当前主题设置 + 已解析的有效主题（system→dark/light）。 */
  getTheme(): Promise<{ setting: Theme; effective: EffectiveTheme }>;
  /** 持久化主题并即时应用（nativeTheme + 窗口色 + 推送 effective 给渲染层）。 */
  setTheme(theme: Theme): Promise<void>;
  /** 监听主进程推送的有效主题变化（system 模式下 OS 切换 / setTheme 后触发）。 */
  onThemeChange(cb: (effective: EffectiveTheme) => void): void;
  /** 用系统浏览器打开外链（handler 内校验 https）。 */
  openExternal(url: string): Promise<void>;
  /** 当前应用版本（app.getVersion()）。 */
  getVersion(): Promise<string>;
  /** 全局仓库根目录（~/.agents/skills，跨平台）。 */
  getGlobalRepoRoot(): Promise<string>;

  // ===== 账号（token 鉴权）=====
  /** 邮箱+密码登录：成功存 token（safeStorage 加密），返回 user。 */
  loginAccount(email: string, password: string): Promise<AccountLoginResult>;
  /** 取当前账号信息（未登录或 token 失效返回 null）。 */
  getAccountInfo(): Promise<PublicUser | null>;
  /** 登出：清除本地 token。 */
  logoutAccount(): Promise<void>;
  /** 第三方登录：在系统浏览器打开 OAuth 起点；回调经 skillkit://auth 深链回应用。 */
  startOAuth(provider: OAuthProvider): Promise<void>;
  /** 用系统浏览器打开账号网页（注册/登录/账号管理）。 */
  openAccountPage(page: 'login' | 'register' | 'account'): Promise<void>;
}

declare global {
  interface Window {
    skillkit: SkillkitApi;
  }
}
