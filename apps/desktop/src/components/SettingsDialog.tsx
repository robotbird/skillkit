import { useEffect, useState, type FormEvent } from 'react';
import ModalPortal from './ModalPortal';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/useTheme';
import { useAccount } from '../lib/useAccount';
import { useUpdate } from '../lib/useUpdate';
import type { Theme, Locale } from '@shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type Section = 'account' | 'appearance' | 'language' | 'space' | 'about';

/** 把绝对路径的 home 前缀缩写为 ~（跨平台：/Users/x/.agents/… → ~/.agents/… ； C:\Users\x\.agents\… → ~\.agents\…）。 */
function abbreviateHome(p: string): string {
  return p.replace(/^(.+?)([/\\]\.agents[/\\].*)$/, '~$2');
}

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('account');
  const [busy, setBusy] = useState(false);

  // Esc 关闭（busy 进行中不响应，避免中断登录等异步操作）
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

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
          if (e.target === e.currentTarget && !busy) onClose();
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
          </nav>
          <div className="settings-content">
            {section === 'account' && <AccountSection busy={busy} onBusyChange={setBusy} />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'language' && <LanguageSection />}
            {section === 'space' && <SpaceSection />}
            {section === 'about' && <AboutSection />}
          </div>
          <button className="settings-close" onClick={onClose} title={t('settings.close')} aria-label={t('settings.close')}>
            ✕
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}

// ===== 账号 =====
function AccountSection({ busy, onBusyChange }: { busy: boolean; onBusyChange: (b: boolean) => void }) {
  const { t } = useI18n();
  const { user, loading, login, logout } = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    onBusyChange(true);
    setError(null);
    const r = await login(email.trim(), password);
    onBusyChange(false);
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
          <Button variant="outline" onClick={() => logout()}>{t('account.logout')}</Button>
          <Button variant="link" onClick={() => window.skillkit.openAccountPage('account')}>
            {t('account.manage')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="settings-section" onSubmit={onSubmit}>
      <h3>{t('account.notSignedIn')}</h3>
      <p className="settings-hint">{t('account.loginHint')}</p>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="login-email">{t('account.emailLabel')}</FieldLabel>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="login-password">{t('account.passwordLabel')}</FieldLabel>
          <Input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </Field>
        {error && <FieldError>{error}</FieldError>}
      </FieldGroup>
      <div className="settings-actions">
        <Button type="submit" disabled={busy}>
          {busy ? t('account.loggingIn') : t('account.loginBtn')}
        </Button>
        <Button type="button" variant="link" onClick={() => window.skillkit.openAccountPage('register')}>
          {t('account.register')}
        </Button>
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
      <ToggleGroup
        type="single"
        value={setting}
        onValueChange={(v) => {
          if (v) changeTheme(v as Theme);
        }}
        variant="outline"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.key} value={o.key}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
      <ToggleGroup
        type="single"
        value={locale}
        onValueChange={(v) => {
          if (v) setLocale(v as Locale);
        }}
        variant="outline"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.key} value={o.key}>
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
        <Button variant="outline" disabled={!path} onClick={() => path && window.skillkit.openPath(path)}>
          {t('space.reveal')}
        </Button>
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
            <Button onClick={apply} disabled={phase === 'downloading' || phase === 'done'}>
              {t('about.update')}
            </Button>
            {phaseLabel && <div className="about-phase">{phaseLabel}</div>}
          </div>
        ) : (
          <div className="about-update-info">
            <Button variant="outline" onClick={check} disabled={checkState === 'checking'}>
              {checkState === 'checking' ? t('about.checking') : t('about.checkUpdate')}
            </Button>
            {checkState === 'upToDate' && <div className="about-phase">{t('about.upToDate')}</div>}
            {checkState === 'error' && <div className="about-phase">{t('about.updateError')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
