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
  /** 弹系统文件框选 zip，返回绝对路径；取消返回 null（仅选文件，不安装）。 */
  pickZip(): Promise<string | null>;
  /** 用已选 zip 路径安装到目标工具。 */
  installFromZip(zipPath: string, targets: Tool[]): Promise<InstallResult[]>;

  shareSkill(tool: Tool, name: string): Promise<ShareCreateResult>;
  inspectShare(input: string): Promise<ShareSourceInfo>;
  installFromShare(input: string, targets: Tool[]): Promise<InstallResult[]>;

  // ===== 仓库（warehouse）：存放 skill「原件」的统一目录 =====
  // 读取仓库根目录（未配置时主进程兜底返回默认 ~/GitHub）
  getWarehouseRoot(): Promise<string>;
  // 弹出系统目录选择器，返回选中路径；取消返回 null（不修改当前设置）
  pickWarehouseRoot(): Promise<string | null>;
  // 校验为已存在目录后持久化，返回持久化后的（绝对）路径
  setWarehouseRoot(path: string): Promise<string>;

  // 分享页深链（skillkit://share/<id>）唤起应用时，主进程通过它把 share id 推给渲染进程
  onDeepLink(cb: (input: string) => void): void;
}

declare global {
  interface Window {
    skillkit: SkillkitApi;
  }
}
