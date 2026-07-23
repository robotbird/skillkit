import { ipcMain, dialog, shell, app } from 'electron';
import path from 'node:path';
import { scanAll, listInstalled, installedTools } from './scan.js';
import { localTools } from './detect.js';
import { TOOLS } from './tools.js';
import { refreshMarket, listMarketSkills, fetchMarketDetail } from './market.js';
import {
  installFromMarket,
  installFromGithub,
  installFromZip,
  uninstall,
  copyInstalledToTools,
  listGithubSkills,
  installGithubSkillsAt,
} from './installer.js';
import { shareSkill, shareGithubLink, inspectShare, installFromShare } from './share.js';
import {
  scanGlobalRepo,
  removeFromGlobalRepo,
  installGlobalToTools,
  globalRepoRoot,
} from './global-repo.js';
import { applyUpdate, getUpdateStatus, checkForUpdate } from './updater.js';
import { metaGet, metaSet, insertInstallRecord, listInstallRecords, clearInstallRecords } from './db.js';
import { buildInstallRecord, buildScanFailureRecord } from './install-log.js';
import { readSkillMdFull } from './skill-md.js';
import { applyTheme, getThemeState } from './theme.js';
import { loginAccount, getAccountInfo, logoutAccount, openAccountPage, startOAuth } from './account.js';
import type {
  Tool,
  InstalledFilter,
  MarketListQuery,
  InstallOpts,
  Theme,
  OAuthProvider,
  InstallResult,
  RepoBatchResult,
  InstallRecordChannel,
} from '../shared/types.js';

/** 把一次安装结果落库为一条安装记录（无任何目标被处理时跳过）。 */
function logInstall(
  channel: InstallRecordChannel,
  label: string,
  results: InstallResult[] | RepoBatchResult[],
): void {
  const rec = buildInstallRecord(channel, label, results);
  if (rec) insertInstallRecord(rec);
}

/** 把一次「扫描阶段失败」（列举/识别 skill 前就失败，无 per-tool 明细）落库。 */
function logScanFailure(channel: InstallRecordChannel, label: string, error: string): void {
  insertInstallRecord(buildScanFailureRecord(channel, label, error));
}

/** 罕见逃逸 throw 时：合成全失败的 InstallResult[]，保持 results 类 handler 的返回形状。 */
function failAll(targets: Tool[], err: any): InstallResult[] {
  const msg = err?.message || String(err);
  return targets.map((t) => ({ tool: t, ok: false, error: msg }));
}

/** 罕见逃逸 throw 时：合成全失败的 RepoBatchResult[]，保持 batch handler 的返回形状。 */
function failBatch(subpaths: string[], targets: Tool[], err: any): RepoBatchResult[] {
  const msg = err?.message || String(err);
  return subpaths.map((subpath) => ({
    subpath,
    skillName: subpath.split('/').pop() ?? subpath,
    results: targets.map((t) => ({ tool: t, ok: false, error: msg })),
  }));
}

export function registerIpc() {
  ipcMain.handle('scan:all', async () => scanAll());
  ipcMain.handle('installed:list', async (_e, filter: InstalledFilter | undefined) =>
    listInstalled(filter),
  );
  ipcMain.handle('installed:tools', async () => installedTools());
  ipcMain.handle('installed:localTools', async () => localTools());
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
  // 读取 skill 目录下 SKILL.md/AGENTS.md 正文（详情弹窗渲染用；只读固定候选名）
  ipcMain.handle('installed:readMd', async (_e, dir: string) => readSkillMdFull(dir));
  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    const err = await shell.openPath(p);
    if (err) console.error('[openPath] failed:', err);
  });

  ipcMain.handle(
    'installed:copyToTools',
    async (_e, sourceTool: Tool, name: string, targets: Tool[]) => {
      let r: InstallResult[];
      try {
        r = copyInstalledToTools(sourceTool, name, targets);
      } catch (err: any) {
        r = failAll(targets, err);
      }
      logInstall('copy', `${sourceTool}/${name}`, r);
      scanAll();
      return r;
    },
  );

  ipcMain.handle('market:refresh', async (_e, force?: boolean) => refreshMarket(!!force));
  ipcMain.handle('market:list', async (_e, q: MarketListQuery | undefined) =>
    listMarketSkills(q),
  );
  ipcMain.handle('market:detail', async (_e, slug: string) => fetchMarketDetail(slug));

  ipcMain.handle(
    'install:fromMarket',
    async (_e, slug: string, targets: Tool[], opts?: InstallOpts) => {
      let r: InstallResult[];
      try {
        r = await installFromMarket(slug, targets, opts);
      } catch (err: any) {
        r = failAll(targets, err);
      }
      logInstall('market', slug, r);
      scanAll();
      return r;
    },
  );
  ipcMain.handle(
    'install:fromGithub',
    async (_e, url: string, targets: Tool[], opts?: InstallOpts) => {
      let r: InstallResult[];
      try {
        r = await installFromGithub(url, targets, opts);
      } catch (err: any) {
        r = failAll(targets, err);
      }
      logInstall('github', url, r);
      scanAll();
      return r;
    },
  );
  // 多 skill 仓库：先列举候选（不装、不写 DB），再批量安装选中项。
  // 扫描阶段失败（抛错、或整包兜底后仍 0 候选）也记一条失败记录，否则用户看到的「未扫到 SKILL.md」无迹可查。
  ipcMain.handle('github:listSkills', async (_e, url: string) => {
    try {
      const res = await listGithubSkills(url);
      if (res.skills.length === 0) {
        logScanFailure('github', url, '未扫到可安装的 SKILL.md / AGENTS.md');
      }
      return res;
    } catch (err: any) {
      logScanFailure('github', url, err?.message || String(err));
      throw err;
    }
  });
  ipcMain.handle(
    'github:installMany',
    async (_e, url: string, subpaths: string[], targets: Tool[], opts?: InstallOpts) => {
      let r: RepoBatchResult[];
      try {
        r = await installGithubSkillsAt(url, subpaths, targets, opts);
      } catch (err: any) {
        r = failBatch(subpaths, targets, err);
      }
      logInstall('github', url, r);
      scanAll();
      return r;
    },
  );
  // zip 安装拆两步：先选文件（返回路径），再凭路径安装
  ipcMain.handle('install:pickZip', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择 Skill 压缩包',
      filters: [{ name: 'Zip 压缩包', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
  ipcMain.handle(
    'install:fromZip',
    async (_e, zipPath: string, targets: Tool[], opts?: InstallOpts) => {
      let r: InstallResult[];
      try {
        r = await installFromZip(zipPath, targets, opts);
      } catch (err: any) {
        r = failAll(targets, err);
      }
      logInstall('zip', path.basename(zipPath), r);
      scanAll();
      return r;
    },
  );

  // 分享
  ipcMain.handle('share:create', async (_e, tool: Tool, name: string) =>
    shareSkill(tool, name),
  );
  ipcMain.handle('share:githubLink', async (_e, tool: Tool, name: string) =>
    shareGithubLink(tool, name),
  );
  ipcMain.handle('share:inspect', async (_e, input: string) => inspectShare(input));
  ipcMain.handle(
    'share:installFromShare',
    async (_e, input: string, targets: Tool[], opts?: InstallOpts) => {
      let r: InstallResult[];
      try {
        r = await installFromShare(input, targets, opts);
      } catch (err: any) {
        r = failAll(targets, err);
      }
      logInstall('share', input, r);
      scanAll();
      return r;
    },
  );

  // 全局仓库（~/.agents/skills）
  ipcMain.handle('globalRepo:scan', async () => scanGlobalRepo());
  ipcMain.handle('globalRepo:remove', async (_e, name: string) => {
    const r = removeFromGlobalRepo(name);
    scanAll();
    return r;
  });
  ipcMain.handle(
    'globalRepo:installToTools',
    async (_e, name: string, targets: Tool[], method: 'symlink' | 'copy') => {
      let r: InstallResult[];
      try {
        r = installGlobalToTools(name, targets, method);
      } catch (err: any) {
        r = failAll(targets, err);
      }
      logInstall('global', name, r);
      scanAll();
      return r;
    },
  );

  // 自动更新
  ipcMain.handle('update:status', async () => getUpdateStatus());
  ipcMain.handle('update:check', async () => checkForUpdate());
  ipcMain.handle('update:apply', async () => applyUpdate());

  // ===== 设置（meta KV 通用读写）=====
  ipcMain.handle('setting:get', (_e, key: string) => metaGet(key));
  ipcMain.handle('setting:set', (_e, key: string, value: string) => metaSet(key, value));

  // ===== 安装记录（读 / 清空）=====
  ipcMain.handle('install:records:list', () => listInstallRecords());
  ipcMain.handle('install:records:clear', () => clearInstallRecords());

  // ===== 外观 / 版本 / 外链 / 全局仓库路径 =====
  ipcMain.handle('theme:get', async () => getThemeState());
  ipcMain.handle('theme:set', async (_e, theme: Theme) => {
    applyTheme(theme);
  });
  ipcMain.handle('external:open', async (_e, url: string) => {
    // 仅放行 http(s)，避免 file:// / 任意协议被当作跳板
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('非法 URL');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('仅支持 http/https 链接');
    }
    await shell.openExternal(url);
  });
  ipcMain.handle('app:version', async () => app.getVersion());
  ipcMain.handle('globalRepo:root', async () => globalRepoRoot());

  // ===== 账号（token 鉴权）=====
  ipcMain.handle('account:login', async (_e, email: string, password: string) =>
    loginAccount(email, password),
  );
  ipcMain.handle('account:info', async () => getAccountInfo());
  ipcMain.handle('account:logout', async () => logoutAccount());
  ipcMain.handle('account:startOAuth', async (_e, provider: OAuthProvider) => startOAuth(provider));
  ipcMain.handle('account:openPage', async (_e, page: 'login' | 'register' | 'account') =>
    openAccountPage(page),
  );
}

// 仅供主进程内部用，避免循环引用
export { TOOLS };
