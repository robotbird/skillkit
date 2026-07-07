import { useEffect, useState, type FormEvent } from 'react';
import ModalPortal from './ModalPortal';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/useTheme';
import { useAccount } from '../lib/useAccount';
import { useUpdate } from '../lib/useUpdate';
import type { Theme, Locale } from '@shared/types';

type Section = 'account' | 'appearance' | 'language' | 'space' | 'about';

/** 把绝对路径的 home 前缀缩写为 ~（跨平台：/Users/x/.agents/… → ~/.agents/… ； C:\Users\x\.agents\… → ~\.agents\…）。 */
function abbreviateHome(p: string): string {
  return p.replace(/^(.+?)([/\\]\.agents[/\\].*)$/, '~$2');
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('account');

  if (!open) return null;

  const nav: { key: Section; label: string }[] = [
    { key: 'account', label: t('settings.nav.account') },
    { key: 'appearance', label: t('settings.nav.appearance') },
    { key: 'language', label: t('settings.nav.language') },
    { key: 'space', label: t('settings.nav.space') },
    { key: 'about', label: t('settings.nav.about') },
  ];

  return (
    <ModalPortal>
      <div
        className="modal-mask"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal settings-dialog" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
          <nav className="settings-rail">
            <div className="settings-title">{t('settings.title')}</div>
            {nav.map((n) => (
              <button
                key={n.key}
                className={`settings-nav${section === n.key ? ' is-active' : ''}`}
                onClick={() => setSection(n.key)}
              >
                {n.label}
              </button>
            ))}
            <button className="settings-close" onClick={onClose} title={t('settings.close')} aria-label={t('settings.close')}>
              ✕
            </button>
          </nav>
          <div className="settings-content">
            {section === 'account' && <AccountSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'language' && <LanguageSection />}
            {section === 'space' && <SpaceSection />}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// ===== 账号 =====
function AccountSection() {
  const { t } = useI18n();
  const { user, loading, login, logout } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await login(email.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.error || t('account.loginFailed'));
    else {
      setEmail('');
      setPassword('');
    }
  }

  if (loading) {
    return <div className="settings-section"><p className="settings-hint">{t('account.loading')}</p></div>;
  }

  if (user) {
    return (
      <div className="settings-section">
        <h3>{t('account.signedIn')}</h3>
        <div className="account-card">
          <div className="account-name">{user.name || t('account.nameFallback')}</div>
          <div className="account-email">{user.email}</div>
        </div>
        <div className="settings-actions">
          <button className="btn" onClick={() => logout()}>{t('account.logout')}</button>
          <button className="btn-link" onClick={() => window.skillkit.openAccountPage('account')}>
            {t('account.manage')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="settings-section" onSubmit={onSubmit}>
      <h3>{t('account.notSignedIn')}</h3>
      <p className="settings-hint">{t('account.loginHint')}</p>
      <label className="field">
        <span>{t('account.emailLabel')}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />
      </label>
      <label className="field">
        <span>{t('account.passwordLabel')}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
      </label>
      {error && <div className="settings-error">{error}</div>}
      <div className="settings-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? t('account.loggingIn') : t('account.loginBtn')}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={() => window.skillkit.openAccountPage('register')}
        >
          {t('account.register')}
        </button>
      </div>
    </form>
  );
}

// ===== 外观 =====
function AppearanceSection() {
  const { t } = useI18n();
  const { setting, changeTheme } = useTheme();
  const options: { key: Theme; label: string }[] = [
    { key: 'dark', label: t('appearance.dark') },
    { key: 'light', label: t('appearance.light') },
    { key: 'system', label: t('appearance.system') },
  ];
  return (
    <div className="settings-section">
      <h3>{t('appearance.label')}</h3>
      <div className="seg opts">
        {options.map((o) => (
          <label key={o.key} className={`seg-item${setting === o.key ? ' checked' : ''}`}>
            <input
              type="radio"
              name="theme"
              checked={setting === o.key}
              onChange={() => changeTheme(o.key)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ===== 语言 =====
function LanguageSection() {
  const { t, locale, setLocale } = useI18n();
  const options: { key: Locale; label: string }[] = [
    { key: 'zh', label: t('language.zh') },
    { key: 'en', label: t('language.en') },
  ];
  return (
    <div className="settings-section">
      <h3>{t('language.label')}</h3>
      <div className="seg opts">
        {options.map((o) => (
          <label key={o.key} className={`seg-item${locale === o.key ? ' checked' : ''}`}>
            <input
              type="radio"
              name="locale"
              checked={locale === o.key}
              onChange={() => setLocale(o.key)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ===== 空间 =====
function SpaceSection() {
  const { t } = useI18n();
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    window.skillkit
      .getGlobalRepoRoot()
      .then((p) => setPath(p))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="settings-section">
      <h3>{t('space.label')}</h3>
      <div className="kv-card">
        <div className="kv-label">{t('space.globalRepo')}</div>
        {error ? (
          <div className="kv-value is-error">{t('space.loadError')}</div>
        ) : (
          <div className="kv-value" title={path ?? undefined}>
            {path ? abbreviateHome(path) : '…'}
          </div>
        )}
        <div className="kv-desc">{t('space.globalRepoDesc')}</div>
      </div>
      <div className="settings-actions">
        <button
          className="btn"
          disabled={!path}
          onClick={() => path && window.skillkit.openPath(path)}
        >
          {t('space.reveal')}
        </button>
      </div>
    </div>
  );
}

// ===== 关于 =====
function AboutSection() {
  const { t } = useI18n();
  const [version, setVersion] = useState('');
  const { info, phase, checkState, check, apply } = useUpdate();

  useEffect(() => {
    window.skillkit.getVersion().then((v) => setVersion(v)).catch(() => {});
  }, []);

  const phaseLabel =
    phase === 'downloading'
      ? t('about.downloading')
      : phase === 'done'
        ? t('about.done', { version: info?.version ?? '' })
        : phase === 'error'
          ? t('about.updateError')
          : null;

  return (
    <div className="settings-section">
      <h3>{t('about.label')}</h3>
      <div className="kv-card">
        <div className="kv-label">{t('about.version')}</div>
        <div className="kv-value">v{version || '…'}</div>
      </div>

      <div className="about-update">
        {info ? (
          <div className="about-update-info">
            <div className="about-new">{t('about.newVersion', { version: info.version })}</div>
            <button className="btn primary" onClick={apply} disabled={phase === 'downloading' || phase === 'done'}>
              {t('about.update')}
            </button>
            {phaseLabel && <div className="about-phase">{phaseLabel}</div>}
          </div>
        ) : (
          <div className="about-update-info">
            <button className="btn" onClick={check} disabled={checkState === 'checking'}>
              {checkState === 'checking' ? t('about.checking') : t('about.checkUpdate')}
            </button>
            {checkState === 'upToDate' && <div className="about-phase">{t('about.upToDate')}</div>}
            {checkState === 'error' && <div className="about-phase">{t('about.updateError')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
