import { contextBridge, ipcRenderer } from 'electron';
import type {
  SkillzixApi,
  Tool,
  InstalledFilter,
  MarketListQuery,
} from '../shared/types.js';

const api: SkillzixApi = {
  scanAll: () => ipcRenderer.invoke('scan:all'),
  listInstalled: (filter?: InstalledFilter) => ipcRenderer.invoke('installed:list', filter),
  uninstallSkill: (tool: Tool, name: string) =>
    ipcRenderer.invoke('installed:uninstall', tool, name),
  revealInFinder: (p: string) => ipcRenderer.invoke('installed:reveal', p),

  marketRefresh: (force?: boolean) => ipcRenderer.invoke('market:refresh', !!force),
  marketList: (q?: MarketListQuery) => ipcRenderer.invoke('market:list', q),
  marketDetail: (slug: string) => ipcRenderer.invoke('market:detail', slug),

  installFromMarket: (slug: string, targets: Tool[]) =>
    ipcRenderer.invoke('install:fromMarket', slug, targets),
  installFromGithub: (url: string, targets: Tool[]) =>
    ipcRenderer.invoke('install:fromGithub', url, targets),
  pickAndInstallZip: (targets: Tool[]) =>
    ipcRenderer.invoke('install:pickAndInstallZip', targets),
};

contextBridge.exposeInMainWorld('skillzix', api);
