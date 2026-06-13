import { useState, useCallback } from 'react';
import TopBar, { type TabKey } from './components/TopBar';
import MySkillsView from './views/MySkillsView';
import MarketView from './views/MarketView';
import InstallView from './views/InstallView';
import Toast, { useToast } from './components/Toast';

export default function App() {
  const [tab, setTab] = useState<TabKey>('my');
  const [installedVersion, setInstalledVersion] = useState(0); // 触发"我的 skill"刷新
  const toast = useToast();

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

      <TopBar tab={tab} onTab={setTab} />

      <main className="main">
        {tab === 'my' && (
          <MySkillsView key={`my-${installedVersion}`} toast={toast} onChanged={() => onInstalled()} />
        )}
        {tab === 'market' && <MarketView toast={toast} onInstalled={() => onInstalled()} />}
        {tab === 'install' && <InstallView toast={toast} onInstalled={() => onInstalled()} />}
      </main>

      <Toast {...toast.props} />
    </>
  );
}
