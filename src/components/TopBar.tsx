import logoMark from '../assets/logo-mark.png';
import UpdateButton from './UpdateButton';

export type TabKey = 'my' | 'market' | 'install' | 'warehouse';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'my', label: '我的 Skill' },
  // { key: 'market', label: '推荐 Skill' }, // 暂时隐藏，后续版本开通
  { key: 'install', label: '安装 Skill' },
  { key: 'warehouse', label: '仓库' },
];

export default function TopBar({
  tab,
  onTab,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
}) {
  return (
    <header className="topbar">
      <div className="topbar-drag" />
      <nav className="tabs" role="tablist">
        <span className="tabs-logo" title="Skillkit">
          <img src={logoMark} width={18} height={18} alt="" aria-hidden="true" />
        </span>
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
      <UpdateButton />
    </header>
  );
}
