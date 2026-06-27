import { useEffect, useState } from 'react';
import type { Tool } from '@shared/types';

// 模块级缓存:同一会话内多个组件(MySkillsView 的 chip、各 ToolPicker)共用一次请求。
let cache: Promise<Tool[]> | null = null;
function fetchInstalled(): Promise<Tool[]> {
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

export interface InstalledToolsState {
  tools: Tool[];
  ready: boolean;
}

/** 已安装工具(其 ~/.<tool> 根目录存在)。用于 UI 只展示 / 可选这些工具。 */
export function useInstalledTools(): InstalledToolsState {
  const [tools, setTools] = useState<Tool[]>([]);
  const [ready, setReady] = useState(false);
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
  return { tools, ready };
}
