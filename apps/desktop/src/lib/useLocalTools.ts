import { useCallback, useEffect, useState } from 'react';
import type { Tool } from '@shared/types';

// 模块级缓存:本机已装的 AI 工具列表在同一会话内稳定(装/卸 skill 不影响),
// 多处复用一次请求。仅在真正新增/卸载某 AI 工具(应用外发生)后才需 invalidate。
let cache: Promise<Tool[]> | null = null;

function fetchLocal(force = false): Promise<Tool[]> {
  if (force) cache = null;
  if (!cache) {
    // window.skillkit 理论上在 preload 后就绪;optional chaining 兜底,未就绪也不抛错。
    cache = (window.skillkit?.installedLocalTools?.() ?? Promise.resolve([] as Tool[])).catch(
      () => [] as Tool[],
    );
  }
  return cache;
}

// 预热:import 本模块即发起请求,等用户进入安装页时通常已就绪。
void fetchLocal();

/** 强制重新探测本机已装工具。 */
export function invalidateLocalTools(): void {
  cache = null;
}

export interface LocalToolsState {
  tools: Tool[];
  ready: boolean;
  /** 重新向主进程拉取本机已装工具列表 */
  refresh: () => Promise<void>;
}

/**
 * 本机已安装的 AI 工具(配置目录存在即可,不要求已有 skill)。
 * 用于安装页工具网格过滤;区别于 useInstalledTools(后者还要求已有 ≥1 skill)。
 */
export function useLocalTools(): LocalToolsState {
  const [tools, setTools] = useState<Tool[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const t = await fetchLocal(true);
    setTools(t);
    setReady(true);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchLocal().then((t) => {
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
