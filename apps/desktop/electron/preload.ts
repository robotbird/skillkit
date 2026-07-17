import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  SkillkitApi,
  Tool,
  InstalledFilter,
  MarketListQuery,
  InstallOpts,
  UpdateAvailableInfo,
  Theme,
  EffectiveTheme,
  AccountLoginResult,
  PublicUser,
  OAuthProvider,
} from '../shared/types.js';

const api: SkillkitApi = {
  scanAll: () => ipcRenderer.invoke('scan:all'),
  listInstalled: (filter?: InstalledFilter) => ipcRenderer.invoke('installed:list', filter),
  installedTools: () => ipcRenderer.invoke('installed:tools'),
  installedLocalTools: () => ipcRenderer.invoke('installed:localTools'),
  uninstallSkill: (tool: Tool, name: string) =>
    ipcRenderer.invoke('installed:uninstall', tool, name),
  revealInFinder: (p: string) => ipcRenderer.invoke('installed:reveal', p),
  readSkillMd: (dir: string) => ipcRenderer.invoke('installed:readMd', dir),
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  copyToTools: (sourceTool: Tool, name: string, targets: Tool[]) =>
    ipcRenderer.invoke('installed:copyToTools', sourceTool, name, targets),

  marketRefresh: (force?: boolean) => ipcRenderer.invoke('market:refresh', !!force),
  marketList: (q?: MarketListQuery) => ipcRenderer.invoke('market:list', q),
  marketDetail: (slug: string) => ipcRenderer.invoke('market:detail', slug),

  installFromMarket: (slug: string, targets: Tool[], opts?: InstallOpts) =>
    ipcRenderer.invoke('install:fromMarket', slug, targets, opts),
  installFromGithub: (url: string, targets: Tool[], opts?: InstallOpts) =>
    ipcRenderer.invoke('install:fromGithub', url, targets, opts),
  listGithubSkills: (url: string) => ipcRenderer.invoke('github:listSkills', url),
  installGithubSkillsAt: (
    url: string,
    subpaths: string[],
    targets: Tool[],
    opts?: InstallOpts,
  ) => ipcRenderer.invoke('github:installMany', url, subpaths, targets, opts),
  pickZip: () => ipcRenderer.invoke('install:pickZip'),
  installFromZip: (zipPath: string, targets: Tool[], opts?: InstallOpts) =>
    ipcRenderer.invoke('install:fromZip', zipPath, targets, opts),

  // 拖拽上传：从 drop 事件的 File 取系统绝对路径（Electron webUtils.getPathForFile）
  getDroppedFilePath: (file: File) => webUtils.getPathForFile(file),

  shareSkill: (tool: Tool, name: string) => ipcRenderer.invoke('share:create', tool, name),
  shareGithubLink: (tool: Tool, name: string) =>
    ipcRenderer.invoke('share:githubLink', tool, name),
  inspectShare: (input: string) => ipcRenderer.invoke('share:inspect', input),
  installFromShare: (input: string, targets: Tool[], opts?: InstallOpts) =>
    ipcRenderer.invoke('share:installFromShare', input, targets, opts),

  // 全局仓库（~/.agents/skills）
  scanGlobalRepo: () => ipcRenderer.invoke('globalRepo:scan'),
  removeFromGlobalRepo: (name: string) => ipcRenderer.invoke('globalRepo:remove', name),
  installGlobalToTools: (name: string, targets: Tool[], method: 'symlink' | 'copy') =>
    ipcRenderer.invoke('globalRepo:installToTools', name, targets, method),

    // 分享页「从 Skillkit 打开」唤起本应用时，主进程经此通道把 share id 推给渲染进程
  onDeepLink: (cb: (input: string) => void) => {
    ipcRenderer.on('skillkit:deep-link', (_e, input: string) => cb(input));
  },
  // OAuth 回调（skillkit://auth?code=...）换 token 后，主进程经此通道把结果推给渲染进程
  onOAuthResult: (cb: (r: AccountLoginResult) => void) => {
    const listener = (_e: IpcRendererEvent, r: AccountLoginResult) => cb(r);
    ipcRenderer.on('account:oauth-result', listener);
    return () => ipcRenderer.removeListener('account:oauth-result', listener);
  },

  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update:available', (_e, info: UpdateAvailableInfo) => cb(info));
  },
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  applyUpdate: () => ipcRenderer.invoke('update:apply'),

  // 设置（meta KV）
  getSetting: (key: string) => ipcRenderer.invoke('setting:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('setting:set', key, value),

  // 外观
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme: Theme) => ipcRenderer.invoke('theme:set', theme),
  onThemeChange: (cb: (effective: EffectiveTheme) => void) => {
    ipcRenderer.on('theme:effective', (_e, eff: EffectiveTheme) => cb(eff));
  },

  // 外链 / 版本 / 全局仓库路径
  openExternal: (url: string) => ipcRenderer.invoke('external:open', url),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getGlobalRepoRoot: () => ipcRenderer.invoke('globalRepo:root'),

  // 账号（token 鉴权）
  loginAccount: (email: string, password: string) =>
    ipcRenderer.invoke('account:login', email, password),
  getAccountInfo: () => ipcRenderer.invoke('account:info') as Promise<PublicUser | null>,
  logoutAccount: () => ipcRenderer.invoke('account:logout'),
  startOAuth: (provider: OAuthProvider) => ipcRenderer.invoke('account:startOAuth', provider),
  openAccountPage: (page: 'login' | 'register' | 'account') =>
    ipcRenderer.invoke('account:openPage', page),
};

contextBridge.exposeInMainWorld('skillkit', api);
