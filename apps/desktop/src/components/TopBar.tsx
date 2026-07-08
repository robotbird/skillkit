import { useState } from 'react';
import UpdateButton from './UpdateButton';
import SettingsDialog from './SettingsDialog';
import { useI18n } from '../i18n';
import { isWindows } from '../lib/os';
import { useToolbarSlotHost } from './ToolbarSlot';

export type TabKey = 'my' | 'market' | 'install';

export default function TopBar({
  tab,
  onTab,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
}) {
  const { t } = useI18n();
  const slotRef = useToolbarSlotHost();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'my', label: t('tab.my') },
    // { key: 'market', label: t('tab.market') }, // 暂时隐藏，后续版本开通
    { key: 'install', label: t('tab.install') },
  ];

  return (
    <>
      <header className="topbar" data-os={isWindows ? 'win' : 'mac'}>
        <div className="topbar-drag" />
        <nav className="tabs" role="tablist">
          {tabs.map((tt) => (
            <button
              key={tt.key}
              role="tab"
              className={`tab${tab === tt.key ? ' is-active' : ''}`}
              onClick={() => onTab(tt.key)}
            >
              {tt.label}
            </button>
          ))}
        </nav>
        <div className="toolbar-trail">
          {/* 当前激活视图通过 portal 把搜索/视图切换/重新扫描 等控件注入此处 */}
          <div className="toolbar-slot" ref={slotRef} />
          <UpdateButton />
          <button
            className="settings-btn"
            title={t('settings.gear')}
            aria-label={t('settings.gear')}
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"
              />
            </svg>
          </button>
        </div>
      </header>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
