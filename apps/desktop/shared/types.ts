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

// ===== 自动更新(desktop 专用) =====
export interface UpdateAvailableInfo {
  version: string; // 最新版本号(去 v 前缀)
  currentVersion: string; // 当前版本
  releaseUrl: string; // release 页(兜底)
  downloadUrl: string; // 匹配平台/架构的安装包直链
  downloadName: string; // 安装包文件名
}

// ===== preload 暴露在 window.skillkit 上的 IPC 契约(desktop 专用) =====
export interface SkillkitApi {
  scanAll(): Promise<InstalledSkill[]>;
  listInstalled(filter?: InstalledFilter): Promise<InstalledSkill[]>;
  /** 已安装工具(其 ~/.<tool> 根目录存在);UI 仅展示/可选这些工具。 */
  installedTools(): Promise<Tool[]>;

  // ===== 自动更新 =====
  /** 监听主进程推送的「发现新版本」事件(检查在后台完成时触发)。 */
  onUpdateAvailable(cb: (info: UpdateAvailableInfo) => void): void;
  /** 查询当前已知的更新状态(渲染进程挂载时用,避免错过启动期推送)。 */
  getUpdateStatus(): Promise<{ available: boolean; info: UpdateAvailableInfo | null }>;
  /** 触发更新:下载安装包到 ~/Downloads 并打开。 */
  applyUpdate(): Promise<string>;
  uninstallSkill(tool: Tool, name: string): Promise<void>;
  revealInFinder(absPath: string): Promise<void>;
  copyToTools(sourceTool: Tool, name: string, targets: Tool[]): Promise<InstallResult[]>;

  marketRefresh(force?: boolean): Promise<MarketRefreshResult>;
  marketList(query?: MarketListQuery): Promise<MarketListResult>;
  marketDetail(slug: string): Promise<{ description: string | null }>;

  installFromMarket(slug: string, targets: Tool[]): Promise<InstallResult[]>;
  installFromGithub(url: string, targets: Tool[]): Promise<InstallResult[]>;
  /** 列举 GitHub 仓库内的 skill 候选（单 skill 仓库返回 kind:'single'）。不安装、不写 DB。 */
  listGithubSkills(url: string): Promise<GithubSkillsResult>;
  /** 批量安装仓库内多个 subpath（skill）到所选工具；装完由 IPC handler 触发 scanAll。 */
  installGithubSkillsAt(url: string, subpaths: string[], targets: Tool[]): Promise<RepoBatchResult[]>;
  /** 弹系统文件框选 zip，返回绝对路径；取消返回 null（仅选文件，不安装）。 */
  pickZip(): Promise<string | null>;
  /** 用已选 zip 路径安装到目标工具。 */
  installFromZip(zipPath: string, targets: Tool[]): Promise<InstallResult[]>;

  /** 从拖拽事件的 File 取系统绝对路径（Electron webUtils.getPathForFile）。 */
  getDroppedFilePath(file: File): string;

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
