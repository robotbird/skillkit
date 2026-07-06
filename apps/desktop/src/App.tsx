import { useState, useCallback, useEffect } from 'react';
import TopBar, { type TabKey } from './components/TopBar';
import { ToolbarSlotProvider } from './components/ToolbarSlot';
import MySkillsView from './views/MySkillsView';
import MarketView from './views/MarketView';
import InstallView from './views/InstallView';
import Toast, { useToast } from './components/Toast';

export default function App() {
  const [tab, setTab] = useState<TabKey>('my');
  const [installedVersion, setInstalledVersion] = useState(0); // 触发"我的 skill"刷新
  const [pendingShare, setPendingShare] = useState<string | null>(null); // 分享页深链推入的 share id
  const toast = useToast();

  // 分享页「从 Skillkit 打开」深链：主进程推送 share id → 切到安装页并预填
  useEffect(() => {
    window.skillkit.onDeepLink((input) => {
      setTab('install');
      setPendingShare(input);
    });
  }, []);

  const onInstalled = useCallback((msg?: string) => {
    setInstalledVersion((v) => v + 1);
    if (msg) toast.show(msg);
  }, [toast]);

  return (
    <>
      <div className="bg">
        <div className="bg-vignette" />
        <div className="bg-grain" />
      </div>

      <ToolbarSlotProvider>
        <TopBar tab={tab} onTab={setTab} />

        <main className="main">
          {tab === 'my' && (
            <MySkillsView key={`my-${installedVersion}`} toast={toast} onChanged={() => onInstalled()} />
          )}
          {tab === 'market' && <MarketView toast={toast} onInstalled={() => onInstalled()} />}
          {tab === 'install' && (
            <InstallView
              toast={toast}
              onInstalled={() => onInstalled()}
              pendingShare={pendingShare}
              onPendingConsumed={() => setPendingShare(null)}
            />
          )}
        </main>
      </ToolbarSlotProvider>

      <Toast {...toast.props} />
    </>
  );
}
