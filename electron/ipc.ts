import { ipcMain, dialog, shell } from 'electron';
import { scanAll, listInstalled, installedTools } from './scan.js';
import { TOOLS } from './tools.js';
import { refreshMarket, listMarketSkills, fetchMarketDetail } from './market.js';
import {
  installFromMarket,
  installFromGithub,
  installFromZip,
  uninstall,
  copyInstalledToTools,
} from './installer.js';
import { shareSkill, inspectShare, installFromShare } from './share.js';
import { getWarehouseRoot, setWarehouseRoot } from './warehouse.js';
import { applyUpdate, getUpdateStatus } from './updater.js';
import type { Tool, InstalledFilter, MarketListQuery } from '../shared/types.js';

export function registerIpc() {
  ipcMain.handle('scan:all', async () => scanAll());
  ipcMain.handle('installed:list', async (_e, filter: InstalledFilter | undefined) =>
    listInstalled(filter),
  );
  ipcMain.handle('installed:tools', async () => installedTools());
  ipcMain.handle('installed:uninstall', async (_e, tool: Tool, name: string) => {
    const list = listInstalled({ tool });
    const target = list.find((s) => s.name === name);
    if (target?.isBuiltin) throw new Error('内置 skill 无法卸载');
    uninstall(tool, name);
    scanAll();
  });
  ipcMain.handle('installed:reveal', async (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle(
    'installed:copyToTools',
    async (_e, sourceTool: Tool, name: string, targets: Tool[]) => {
      const r = copyInstalledToTools(sourceTool, name, targets);
      scanAll();
      return r;
    },
  );

  ipcMain.handle('market:refresh', async (_e, force?: boolean) => refreshMarket(!!force));
  ipcMain.handle('market:list', async (_e, q: MarketListQuery | undefined) =>
    listMarketSkills(q),
  );
  ipcMain.handle('market:detail', async (_e, slug: string) => fetchMarketDetail(slug));

  ipcMain.handle('install:fromMarket', async (_e, slug: string, targets: Tool[]) => {
    const r = await installFromMarket(slug, targets);
    scanAll();
    return r;
  });
  ipcMain.handle('install:fromGithub', async (_e, url: string, targets: Tool[]) => {
    const r = await installFromGithub(url, targets);
    scanAll();
    return r;
  });
  ipcMain.handle('install:pickAndInstallZip', async (_e, targets: Tool[]) => {
    const result = await dialog.showOpenDialog({
      title: '选择 Skill 压缩包',
      filters: [{ name: 'Zip 压缩包', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    const r = await installFromZip(result.filePaths[0], targets);
    scanAll();
    return r;
  });

  // 分享
  ipcMain.handle('share:create', async (_e, tool: Tool, name: string) =>
    shareSkill(tool, name),
  );
  ipcMain.handle('share:inspect', async (_e, input: string) => inspectShare(input));
  ipcMain.handle('share:installFromShare', async (_e, input: string, targets: Tool[]) => {
    const r = await installFromShare(input, targets);
    scanAll();
    return r;
  });

  // 仓库根目录配置
  ipcMain.handle('warehouse:get', async () => getWarehouseRoot());
  ipcMain.handle('warehouse:pick', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Skill 仓库根目录',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('warehouse:set', async (_e, p: string) => setWarehouseRoot(p));

  // 自动更新
  ipcMain.handle('update:status', async () => getUpdateStatus());
  ipcMain.handle('update:apply', async () => applyUpdate());
}

// 仅供主进程内部用，避免循环引用
export { TOOLS };
