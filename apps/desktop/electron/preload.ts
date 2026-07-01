import { contextBridge, ipcRenderer } from 'electron';
import type {
  SkillkitApi,
  Tool,
  InstalledFilter,
  MarketListQuery,
  UpdateAvailableInfo,
} from '../shared/types.js';

const api: SkillkitApi = {
  scanAll: () => ipcRenderer.invoke('scan:all'),
  listInstalled: (filter?: InstalledFilter) => ipcRenderer.invoke('installed:list', filter),
  installedTools: () => ipcRenderer.invoke('installed:tools'),
  uninstallSkill: (tool: Tool, name: string) =>
    ipcRenderer.invoke('installed:uninstall', tool, name),
  revealInFinder: (p: string) => ipcRenderer.invoke('installed:reveal', p),
  copyToTools: (sourceTool: Tool, name: string, targets: Tool[]) =>
    ipcRenderer.invoke('installed:copyToTools', sourceTool, name, targets),

  marketRefresh: (force?: boolean) => ipcRenderer.invoke('market:refresh', !!force),
  marketList: (q?: MarketListQuery) => ipcRenderer.invoke('market:list', q),
  marketDetail: (slug: string) => ipcRenderer.invoke('market:detail', slug),

  installFromMarket: (slug: string, targets: Tool[]) =>
    ipcRenderer.invoke('install:fromMarket', slug, targets),
  installFromGithub: (url: string, targets: Tool[]) =>
    ipcRenderer.invoke('install:fromGithub', url, targets),
  pickZip: () => ipcRenderer.invoke('install:pickZip'),
  installFromZip: (zipPath: string, targets: Tool[]) =>
    ipcRenderer.invoke('install:fromZip', zipPath, targets),

  shareSkill: (tool: Tool, name: string) => ipcRenderer.invoke('share:create', tool, name),
  inspectShare: (input: string) => ipcRenderer.invoke('share:inspect', input),
  installFromShare: (input: string, targets: Tool[]) =>
    ipcRenderer.invoke('share:installFromShare', input, targets),

  getWarehouseRoot: () => ipcRenderer.invoke('warehouse:get'),
  pickWarehouseRoot: () => ipcRenderer.invoke('warehouse:pick'),
  setWarehouseRoot: (path: string) => ipcRenderer.invoke('warehouse:set', path),

  // 分享页「从 Skillkit 打开」唤起本应用时，主进程经此通道把 share id 推给渲染进程
  onDeepLink: (cb: (input: string) => void) => {
    ipcRenderer.on('skillkit:deep-link', (_e, input: string) => cb(input));
  },

  onUpdateAvailable: (cb) => {
    ipcRenderer.on('update:available', (_e, info: UpdateAvailableInfo) => cb(info));
  },
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  applyUpdate: () => ipcRenderer.invoke('update:apply'),
};

contextBridge.exposeInMainWorld('skillkit', api);
