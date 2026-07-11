import { useCallback, useEffect, useState } from 'react';
import type { Tool } from '@shared/types';

// 模块级缓存:同一会话内多个组件(MySkillsView 的 chip、各 ToolPicker)共用一次请求。
let cache: Promise<Tool[]> | null = null;

function fetchInstalled(force = false): Promise<Tool[]> {
  if (force) cache = null;
  if (!cache) {
    // window.skillkit 理论上在 preload 后就绪;optional chaining 兜底,未就绪也不抛错。
    cache = (window.skillkit?.installedTools?.() ?? Promise.resolve([] as Tool[])).catch(
      () => [] as Tool[],
    );
  }
  return cache;
}

// 预热:import 本模块即发起请求,等用户打开任何 ToolPicker / 进入 My Skills 时通常已就绪。
void fetchInstalled();

/** 强制重新探测本机已安装工具（扫描/安装后调用）。 */
export function invalidateInstalledTools(): void {
  cache = null;
}

export interface InstalledToolsState {
  tools: Tool[];
  ready: boolean;
  /** 重新向主进程拉取已安装工具列表 */
  refresh: () => Promise<void>;
}

/** 可展示工具：本机有 agent 配置且至少有 1 个 skill。用于 chip / 安装选择器。 */
export function useInstalledTools(): InstalledToolsState {
  const [tools, setTools] = useState<Tool[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const t = await fetchInstalled(true);
    setTools(t);
    setReady(true);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchInstalled().then((t) => {
      if (alive) {
        setTools(t);
        setReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return { tools, ready, refresh };
}
