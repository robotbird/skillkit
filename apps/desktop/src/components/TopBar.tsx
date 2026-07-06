import UpdateButton from './UpdateButton';
import { isWindows } from '../lib/os';
import { useToolbarSlotHost } from './ToolbarSlot';

export type TabKey = 'my' | 'market' | 'install';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'my', label: '我的 Skill' },
  // { key: 'market', label: '推荐 Skill' }, // 暂时隐藏，后续版本开通
  { key: 'install', label: '安装 Skill' },
];

export default function TopBar({
  tab,
  onTab,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
}) {
  const slotRef = useToolbarSlotHost();
  return (
    <header className="topbar" data-os={isWindows ? 'win' : 'mac'}>
      <div className="topbar-drag" />
      <nav className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            className={`tab${tab === t.key ? ' is-active' : ''}`}
            onClick={() => onTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="toolbar-trail">
        {/* 当前激活视图通过 portal 把搜索/视图切换/重新扫描 等控件注入此处 */}
        <div className="toolbar-slot" ref={slotRef} />
        <UpdateButton />
      </div>
    </header>
  );
}
