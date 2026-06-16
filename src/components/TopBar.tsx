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
  return (
    <header className="topbar">
      <div className="topbar-drag" />
      <nav className="tabs" role="tablist">
        <span className="tabs-logo" title="Skillkit">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 2.5l2.6 5.4 5.9.9-4.3 4.1 1 5.9L12 16l-5.2 2.8 1-5.9L3.5 8.8l5.9-.9L12 2.5z"
            />
          </svg>
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
    </header>
  );
}
