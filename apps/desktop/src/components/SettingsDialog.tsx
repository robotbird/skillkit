import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import ModalPortal from './ModalPortal';
import { useI18n } from '../i18n';
import { useTheme } from '../lib/useTheme';
import { useAccount } from '../lib/useAccount';
import { useUpdate } from '../lib/useUpdate';
import { formatTime, formatBytes, formatSpeed } from '../lib/format';
import {
  SETTING_KEYS,
  type Theme,
  type Locale,
  type SkillUpdateInterval,
  type CustomTool,
  type CustomToolKind,
  type BuiltinTool,
  type SyncStatusInfo,
} from '@shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { GitHubIcon, GoogleIcon } from './oauth-icons';
import {
  useCustomTools,
  invalidateCustomTools,
  recommendIcon,
  customToolIconSelection,
  selectionToPatch,
  type IconSelection,
} from '../lib/toolCatalog';
import { ICON_CHOICES, TOOL_ICON } from '../lib/toolIcons';
import { fileToIconDataUri } from '../lib/iconImage';
import { invalidateInstalledTools } from '../lib/useInstalledTools';
import { invalidateLocalTools } from '../lib/useLocalTools';

type Section = 'account' | 'appearance' | 'language' | 'space' | 'sync' | 'updates' | 'about';

/** 把绝对路径的 home 前缀缩写为 ~（跨平台：/Users/x/.agents/… → ~/.agents/… ； C:\Users\x\.agents\… → ~\.agents\…）。 */
function abbreviateHome(p: string): string {
  return p.replace(/^(.+?)([/\\]\.agents[/\\].*)$/, '~$2');
}

export default function SettingsDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  /** 设置内发生需刷新主页的数据变更（如增删自定义 agent）时回调，触发「我的 Skill」重扫。 */
  onChanged?: () => void;
}) {
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
    { key: 'sync', label: t('settings.nav.sync') },
    { key: 'updates', label: t('settings.nav.updates') },
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
            {section === 'space' && <SkillSpaceSection onChanged={onChanged} />}
            {section === 'sync' && <SyncSection onChanged={onChanged} />}
            {section === 'updates' && <UpdatesSection />}
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
  const { user, loading, login, logout, startOAuth, oauthPending, oauthError } = useAccount();
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
        <Button type="submit" disabled={busy || oauthPending}>
          {busy ? t('account.loggingIn') : t('account.loginBtn')}
        </Button>
        <Button type="button" variant="link" onClick={() => window.skillkit.openAccountPage('register')}>
          {t('account.register')}
        </Button>
      </div>
      <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>{t('account.or')}</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
          disabled={busy || oauthPending}
          onClick={() => startOAuth('github')}
        >
          <GitHubIcon className="size-[18px]" />
          {oauthPending ? t('account.oauthInProgress') : t('account.oauthGithub')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2"
          disabled={busy || oauthPending}
          onClick={() => startOAuth('google')}
        >
          <GoogleIcon className="size-[18px]" />
          {oauthPending ? t('account.oauthInProgress') : t('account.oauthGoogle')}
        </Button>
      </div>
      {oauthError && <FieldError>{oauthError}</FieldError>}
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

// ===== Skill 空间（全局仓库 + 自定义 Agent/项目）=====
function SkillSpaceSection({ onChanged }: { onChanged?: () => void }) {
  const { t } = useI18n();

  // --- 全局仓库：只读展示路径 ---
  const [path, setPath] = useState<string | null>(null);
  const [pathError, setPathError] = useState(false);

  useEffect(() => {
    window.skillkit
      .getGlobalRepoRoot()
      .then((p) => setPath(p))
      .catch(() => setPathError(true));
  }, []);

  // --- 自定义 Agent / 项目 ---
  const { customs } = useCustomTools();
  const [name, setName] = useState('');
  const [root, setRoot] = useState('');
  const [kind, setKind] = useState<CustomToolKind>('agent');
  // 图标取值：自动（首字母）/ 品牌图标 / 上传图片，三选一互斥。
  const [iconSel, setIconSel] = useState<IconSelection>({ t: 'auto' });
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 添加表单默认收起，点「添加 Agent / 项目」按钮展开，取消或添加成功后收起。
  const [showForm, setShowForm] = useState(false);

  // 名称驱动的推荐图标：仅作为浮层里的「荐」角标提示；头像默认始终显示名称首字。
  const recommend = useMemo(() => recommendIcon(name), [name]);

  // 项目类型填项目根目录（扫描其下 .claude/skills 等）；agent 变体填 skill 目录。文案随之切换。
  const namePlaceholderKey = kind === 'project' ? 'agents.namePlaceholderProject' : 'agents.namePlaceholder';
  const rootLabelKey = kind === 'project' ? 'agents.rootLabelProject' : 'agents.rootLabel';
  const rootPlaceholderKey = kind === 'project' ? 'agents.rootPlaceholderProject' : 'agents.rootPlaceholder';
  const pathHintKey = kind === 'project' ? 'agents.pathHintProject' : 'agents.pathHint';

  const agents = customs.filter((c) => c.kind !== 'project');
  const projects = customs.filter((c) => c.kind === 'project');

  // 增删改后让其余视图同步：失效三处模块缓存 + bump installedVersion（remount「我的 Skill」触发重扫）。
  function syncOthers() {
    invalidateCustomTools();
    invalidateInstalledTools();
    invalidateLocalTools();
    onChanged?.();
  }

  async function pickDir() {
    const p = await window.skillkit.pickDirectory(t(rootLabelKey));
    if (p) setRoot(p);
  }

  function resetForm() {
    setName('');
    setRoot('');
    setKind('agent');
    setIconSel({ t: 'auto' });
  }

  function openAddForm() {
    resetForm();
    setFormError(null);
    setShowForm(true);
  }

  function cancelAddForm() {
    setShowForm(false);
    resetForm();
    setFormError(null);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const r = root.trim();
    if (!n || !r) return;
    setAdding(true);
    setFormError(null);
    try {
      // iconSel 统一表达「自动 / 品牌 / 上传图片」三态；写库时按互斥规则拆成 icon/iconImage。
      await window.skillkit.addCustomTool(n, r, { kind, ...selectionToPatch(iconSel) });
      resetForm();
      setShowForm(false); // 添加成功后收起表单，让用户在列表里看到新增项
      syncOthers();
    } catch (err: any) {
      setFormError(t('agents.addFail', { error: err?.message ?? String(err) }));
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(c: CustomTool) {
    if (!confirm(t('agents.confirmRemove', { name: c.label }))) return;
    try {
      await window.skillkit.removeCustomTool(c.id);
      syncOthers();
    } catch (err: any) {
      setFormError(t('agents.removeFail', { error: err?.message ?? String(err) }));
    }
  }

  async function onChangeIcon(c: CustomTool, sel: IconSelection) {
    try {
      await window.skillkit.updateCustomTool(c.id, selectionToPatch(sel));
      syncOthers();
    } catch (err: any) {
      setFormError(t('agents.changeIconFail', { error: err?.message ?? String(err) }));
    }
  }

  function renderGroup(list: CustomTool[]) {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        {list.map((c) => (
          <div className="kv-card" key={c.id}>
            <div className="flex items-center gap-3">
              <IconPickerPopover
                value={customToolIconSelection(c)}
                recommend={recommendIcon(c.label)}
                autoLetter={(c.label.trim()[0] || '?').toUpperCase()}
                onChange={(sel) => onChangeIcon(c, sel)}
                onUploadError={(m) => setFormError(m)}
              />
              <div className="min-w-0 flex-1">
                <div className="kv-label">{c.label}</div>
                <div className="kv-value" title={c.skillsRoot}>
                  {c.skillsRoot}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => onRemove(c)}>
                {t('agents.remove')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h3>{t('space.label')}</h3>

      {/* 区块一：全局仓库 */}
      <div className="settings-subblock">
        <div className="settings-subblock-title">{t('space.globalRepo')}</div>
        <div className="kv-card">
          {pathError ? (
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

      {/* 区块二：自定义 Agent 与项目 */}
      <div className="settings-subblock">
        <div className="settings-subblock-title">{t('agents.label')}</div>
        <p className="settings-hint">{t('agents.hint')}</p>

        {customs.length > 0 && (
          <div className="space-y-4">
            {renderGroup(agents)}
            {renderGroup(projects)}
          </div>
        )}
        {customs.length === 0 && !showForm && (
          <div className="kv-card">
            <div className="kv-value">{t('agents.empty')}</div>
          </div>
        )}

        {showForm ? (
          <form className="settings-subform" onSubmit={onAdd}>
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel>{t('agents.kindLabel')}</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={kind}
                  onValueChange={(v) => {
                    if (v === 'agent' || v === 'project') setKind(v);
                  }}
                  variant="outline"
                >
                  <ToggleGroupItem value="agent">{t('agents.kindAgent')}</ToggleGroupItem>
                  <ToggleGroupItem value="project">{t('agents.kindProject')}</ToggleGroupItem>
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-name">{t('agents.nameLabel')}</FieldLabel>
                <div className="flex items-center gap-2">
                  <IconPickerPopover
                    value={iconSel}
                    recommend={recommend}
                    autoLetter={(name.trim()[0] || '?').toUpperCase()}
                    onChange={setIconSel}
                    onUploadError={(m) => setFormError(m)}
                    disabled={adding}
                  />
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t(namePlaceholderKey)}
                    required
                    autoFocus
                    className="flex-1"
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="agent-root">{t(rootLabelKey)}</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id="agent-root"
                    value={root}
                    onChange={(e) => setRoot(e.target.value)}
                    placeholder={t(rootPlaceholderKey)}
                    required
                  />
                  <Button type="button" variant="outline" onClick={pickDir} disabled={adding}>
                    {t('agents.pickDir')}
                  </Button>
                </div>
                <p className="settings-hint">{t(pathHintKey)}</p>
              </Field>
              {formError && <FieldError>{formError}</FieldError>}
            </FieldGroup>
            <div className="settings-actions">
              <Button type="submit" disabled={adding || !name.trim() || !root.trim()}>
                {adding ? t('agents.adding') : t('agents.addBtn')}
              </Button>
              <Button type="button" variant="outline" onClick={cancelAddForm} disabled={adding}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="settings-actions">
            <Button variant="outline" onClick={openAddForm}>
              {t('agents.add')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Git 同步（全局仓库 → 用户远程仓库）=====
/** GitHub PAT 官方教程；非中文界面去掉 /zh/ 前缀回落默认（英文）版 */
const GH_PAT_DOC =
  'https://docs.github.com/zh/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens';

function SyncSection({ onChanged }: { onChanged?: () => void }) {
  const { t, locale } = useI18n();
  const patDocUrl = locale === 'zh' ? GH_PAT_DOC : GH_PAT_DOC.replace('/zh/', '/');
  const [status, setStatus] = useState<SyncStatusInfo | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  // PAT 输入框只在用户键入时非空；保存时非空才传（undefined = 保留已存，见 SyncConfigureInput）
  const [token, setToken] = useState('');
  // PAT 字段默认收起（系统 git 凭据链可用时无需填）；已存 PAT 或认证失败时展开
  const [tokenOpen, setTokenOpen] = useState(false);
  // 提交身份（commit 署名，非登录凭证）：默认收起；本机无 git 身份且设置里也没存时自动展开提示
  const [idName, setIdName] = useState('');
  const [idEmail, setIdEmail] = useState('');
  const [idOpen, setIdOpen] = useState(false);
  const [idError, setIdError] = useState(false);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState<null | 'test' | 'save' | 'now' | 'restore'>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /** 认证类失败（主进程 classifyGitError 单点生成，前缀固定「认证失败」）→ 展开 PAT 输入兜底。 */
  function isAuthError(e?: string | null): boolean {
    return !!e && e.startsWith('认证失败');
  }

  async function refresh() {
    try {
      const s = await window.skillkit.getSyncStatus();
      setStatus(s);
      setRepoUrl(s.config.repoUrl);
      setAuto(s.config.auto);
      // 已存 PAT（需可见可清除），或上次自动同步就是认证失败 → 展开；只扩不收，别收走用户手动展开的输入
      setTokenOpen((open) => open || s.config.hasToken || (s.lastOk === false && isAuthError(s.lastError)));
      setIdName(s.config.identityName ?? '');
      setIdEmail(s.config.identityEmail ?? '');
      // 已存提交身份（可见可改），或系统 git 无身份且设置里也没存（否则提交只能走 Skillkit 兜底署名）→ 展开；只扩不收
      setIdOpen((open) => open || !!s.config.identityName || !s.hasGitIdentity);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!status?.syncing) return;
    const timer = setInterval(() => {
      void window.skillkit.getSyncStatus().then(setStatus).catch(() => {});
    }, 1500);
    return () => clearInterval(timer);
  }, [status?.syncing]);

  async function onTest() {
    if (!repoUrl.trim()) return;
    setBusy('test');
    setMessage(null);
    try {
      const r = await window.skillkit.testSyncRemote(repoUrl.trim(), token.trim() || undefined);
      setMessage(
        r.ok ? { ok: true, text: t('sync.testOk') } : { ok: false, text: t('sync.testFail', { error: r.error || '' }) },
      );
      if (!r.ok && isAuthError(r.error)) setTokenOpen(true);
    } catch (err: any) {
      setMessage({ ok: false, text: t('sync.testFail', { error: err?.message ?? String(err) }) });
    } finally {
      setBusy(null);
    }
  }

  async function onSave() {
    // 提交身份须成对（半个身份对 git 无意义）：不成对就地报错，不出网络请求
    if (idOpen && !!idName.trim() !== !!idEmail.trim()) {
      setIdError(true);
      return;
    }
    setIdError(false);
    setBusy('save');
    setMessage(null);
    try {
      const r = await window.skillkit.configureSync({
        repoUrl: repoUrl.trim(),
        auto,
        token: token.trim() || undefined,
        // 提交身份三态：没展开过 = 保留已存；展开后当前输入即最终值（都留空 = 清除，回落系统身份/兜底）
        name: idOpen ? idName : undefined,
        email: idOpen ? idEmail : undefined,
      });
      setMessage(
        r.ok
          ? { ok: true, text: t('sync.saved') }
          : { ok: false, text: r.error || '' },
      );
      setToken(''); // 保存后清空候选输入，回到「已保存」占位态
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message ?? String(err) });
    } finally {
      setBusy(null);
    }
  }

  /** 清除已存 PAT（token:''），不触发推送。 */
  async function onClearToken() {
    setBusy('save');
    setMessage(null);
    try {
      const r = await window.skillkit.configureSync({
        repoUrl: status?.config.repoUrl || '', auto: status?.config.auto || false, token: '',
      });
      if (!r.ok) setMessage({ ok: false, text: r.error || '' });
      setToken('');
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message ?? String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function onSyncNow() {
    setBusy('now');
    setMessage(null);
    try {
      const r = await window.skillkit.syncNow();
      setMessage(
        r.ok
          ? { ok: true, text: r.pushed ? `${t('sync.ok')}${r.summary ? ` · ${r.summary}` : ''}` : t('sync.noChange') }
          : { ok: false, text: r.error || '' },
      );
      if (!r.ok && isAuthError(r.error)) setTokenOpen(true);
      await refresh();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message ?? String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    if (!confirm(t('sync.confirmRestore'))) return;
    setBusy('restore');
    setMessage(null);
    try {
      const r = await window.skillkit.restoreFromSyncRemote();
      setMessage(r.ok
        ? { ok: !r.warnings?.length, text: [t('sync.restoreDone'), ...(r.warnings || [])].join('\n') }
        : { ok: false, text: r.error || '' });
      if (!r.ok && isAuthError(r.error)) setTokenOpen(true);
      await refresh();
      onChanged?.(); // 恢复改变了全局仓内容，让「我的 Skill」重扫
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message ?? String(err) });
    } finally {
      setBusy(null);
    }
  }

  const hasToken = status?.config.hasToken ?? false;
  // 主进程自动同步进行中（打开设置页时可能撞上）也按 busy 处理，避免双跑
  const actionBusy = busy !== null || !!status?.syncing;
  const unsaved = repoUrl.trim() !== status?.config.repoUrl || !!token.trim() || auto !== status?.config.auto ||
    idName.trim() !== (status?.config.identityName || '') || idEmail.trim() !== (status?.config.identityEmail || '');

  return (
    <div className="settings-section">
      <h3>{t('sync.label')}</h3>
      <p className="settings-hint">{t('sync.repoHint')}</p>
      {status && !status.gitAvailable && <FieldError>{t('sync.gitMissing')}</FieldError>}

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="sync-repo">{t('sync.repoLabel')}</FieldLabel>
          <Input
            id="sync-repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder={t('sync.repoPlaceholder')}
            spellCheck={false}
          />
        </Field>
        {tokenOpen ? (
          <Field>
            <FieldLabel htmlFor="sync-token">{t('sync.tokenLabel')}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="sync-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={hasToken ? t('sync.tokenSaved') : t('sync.tokenPlaceholder')}
                className="flex-1"
                autoComplete="off"
              />
              {hasToken && !token && (
                <Button type="button" variant="outline" onClick={onClearToken} disabled={actionBusy}>
                  {t('sync.tokenClear')}
                </Button>
              )}
            </div>
            <p className="settings-hint">
              {t('sync.tokenHowto')}{' '}
              <a
                href={patDocUrl}
                onClick={(e) => {
                  e.preventDefault();
                  void window.skillkit.openExternal(patDocUrl); // 系统浏览器打开，不在应用内导航
                }}
              >
                {t('sync.tokenDoc')}
              </a>
            </p>
          </Field>
        ) : (
          <button type="button" className="sync-token-toggle" onClick={() => setTokenOpen(true)}>
            {t('sync.tokenToggle')}
          </button>
        )}
        {idOpen ? (
          <Field>
            <FieldLabel>{t('sync.identityLabel')}</FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                aria-label={t('sync.identityNamePh')}
                value={idName}
                onChange={(e) => setIdName(e.target.value)}
                placeholder={t('sync.identityNamePh')}
                className="flex-1"
                spellCheck={false}
                autoComplete="off"
              />
              <Input
                aria-label={t('sync.identityEmailPh')}
                type="email"
                value={idEmail}
                onChange={(e) => setIdEmail(e.target.value)}
                placeholder={t('sync.identityEmailPh')}
                className="flex-1"
                autoComplete="off"
              />
            </div>
            {idError && <FieldError>{t('sync.identityInvalid')}</FieldError>}
            <p className="settings-hint">{t('sync.identityHint')}</p>
          </Field>
        ) : (
          <button type="button" className="sync-token-toggle" onClick={() => setIdOpen(true)}>
            {t('sync.identityToggle')}
          </button>
        )}
        <Field>
          <FieldLabel>{t('sync.autoLabel')}</FieldLabel>
          <ToggleGroup
            type="single"
            value={auto ? 'on' : 'off'}
            onValueChange={(v) => {
              if (v) setAuto(v === 'on');
            }}
            variant="outline"
          >
            <ToggleGroupItem value="on">{t('sync.autoOn')}</ToggleGroupItem>
            <ToggleGroupItem value="off">{t('sync.autoOff')}</ToggleGroupItem>
          </ToggleGroup>
          <p className="settings-hint">{t('sync.autoHint')}</p>
        </Field>
      </FieldGroup>

      <div className="settings-actions">
        <Button onClick={onSave} disabled={actionBusy || (!repoUrl.trim() && !status?.configured)}>
          {busy === 'save' ? t('sync.saving') : t('sync.save')}
        </Button>
        <Button variant="outline" onClick={onTest} disabled={actionBusy || !repoUrl.trim()}>
          {busy === 'test' ? t('sync.testing') : t('sync.test')}
        </Button>
        <Button variant="outline" onClick={onSyncNow} disabled={actionBusy || !status?.configured || unsaved}>
          {busy === 'now' ? t('sync.syncing') : t('sync.now')}
        </Button>
        <Button variant="outline" onClick={onRestore} disabled={actionBusy || !status?.configured || unsaved}>
          {busy === 'restore' ? t('sync.restoring') : t('sync.restore')}
        </Button>
      </div>

      {message &&
        (message.ok ? (
          <p className="settings-hint">{message.text}</p>
        ) : (
          <FieldError>{message.text}</FieldError>
        ))}

      <div className="kv-card">
        <div className="kv-label">{t('sync.lastSync')}</div>
        <div className="kv-value">
          {status?.lastTime ? formatTime(status.lastTime) : t('sync.never')}
          {status?.lastOk === true && status.lastSummary ? ` · ${status.lastSummary}` : ''}
          {status?.lastOk === false ? ` · ${t('sync.failed')}` : ''}
        </div>
        {status?.lastOk === false && status.lastError && (
          <div className="kv-value is-error">{status.lastError}</div>
        )}
      </div>
    </div>
  );
}

// ===== Skill 更新 =====
function UpdatesSection() {
  const { t } = useI18n();
  const [interval, setIntervalSetting] = useState<SkillUpdateInterval>('8h');
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.skillkit
      .getSetting(SETTING_KEYS.skillUpdateInterval)
      .then((v) => {
        if (v === 'off' || v === '4h' || v === '8h' || v === '12h' || v === '24h') setIntervalSetting(v);
      })
      .catch(() => {});
    window.skillkit
      .getSetting(SETTING_KEYS.skillUpdateLastRun)
      .then((v) => {
        const n = v ? Number(v) : 0;
        setLastRun(n || null);
      })
      .catch(() => {});
  }, []);

  const options: { key: SkillUpdateInterval; label: string }[] = [
    { key: 'off', label: t('skillUpdate.interval.off') },
    { key: '4h', label: t('skillUpdate.interval.4h') },
    { key: '8h', label: t('skillUpdate.interval.8h') },
    { key: '12h', label: t('skillUpdate.interval.12h') },
    { key: '24h', label: t('skillUpdate.interval.24h') },
  ];

  async function checkNow() {
    if (checking) return;
    setChecking(true);
    try {
      await window.skillkit.checkSkillUpdates(true);
      const v = await window.skillkit.getSetting(SETTING_KEYS.skillUpdateLastRun);
      setLastRun(v ? Number(v) || null : null);
    } catch {
      // 忽略：失败时不阻塞 UI
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="settings-section">
      <h3>{t('skillUpdate.label')}</h3>
      <Field>
        <FieldLabel>{t('skillUpdate.intervalLabel')}</FieldLabel>
        <ToggleGroup
          type="single"
          value={interval}
          onValueChange={(v) => {
            if (v) {
              setIntervalSetting(v as SkillUpdateInterval);
              window.skillkit.setSetting(SETTING_KEYS.skillUpdateInterval, v).catch(() => {});
            }
          }}
          variant="outline"
        >
          {options.map((o) => (
            <ToggleGroupItem key={o.key} value={o.key}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <div className="kv-card">
        <div className="kv-label">{t('skillUpdate.lastCheck')}</div>
        <div className="kv-value">{lastRun ? formatTime(lastRun) : t('skillUpdate.never')}</div>
      </div>
      <div className="settings-actions">
        <Button variant="outline" onClick={checkNow} disabled={checking}>
          {checking ? t('skillUpdate.checking') : t('skillUpdate.checkNow')}
        </Button>
      </div>
      <p className="settings-hint">{t('skillUpdate.hint')}</p>
    </div>
  );
}

/**
 * 图标头像 + 轻量浮层选择器。
 * - 触发器是名称前的一个头像按钮：选了品牌图标显示该 logo，否则显示名称首字（「自动」）。
 * - 点击弹出轻量 popover（portal 到 body、固定定位，避开设置弹窗的 overflow 裁剪），
 *   选完即关；点外部 / Esc / 滚动 / 窗口缩放都会关闭。
 * - value=null 表示「自动」（首字母生成图）；recommend 命中时在该品牌项叠「推荐」角标。
 */
function IconPickerPopover({
  value,
  recommend,
  autoLetter,
  disabled,
  onChange,
  onUploadError,
}: {
  value: IconSelection;
  recommend: BuiltinTool | null;
  autoLetter: string;
  disabled?: boolean;
  onChange: (v: IconSelection) => void;
  onUploadError?: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // 浮层宽高：宽固定 300；高先按估值占位，挂载后用真实 offsetHeight 精修（见下方 useLayoutEffect）。
  const POP_W = 300;
  const EST_H = 200;
  const GAP = 6;

  // 算浮层坐标：默认紧贴头像「上方」（6px）；上方空间不够才回落到下方。并夹在视口内。
  // measured=false 用估值高度（打开瞬间、浮层尚未挂载），=true 用真实高度精修。
  function place(measured: boolean) {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const panelH = measured ? panelRef.current?.offsetHeight ?? EST_H : EST_H;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
    const aboveTop = r.top - GAP - panelH;
    const top = aboveTop >= 8 ? aboveTop : r.bottom + GAP;
    setPos({ top, left });
  }

  // 浮层挂载后用真实高度重算，消除估值误差导致的过大间距。
  useLayoutEffect(() => {
    if (!open) return;
    place(true);
  }, [open]);

  function toggle() {
    if (disabled) return;
    if (!open) place(false); // 先用估值占位，渲染后由 useLayoutEffect 用真实高度精修
    setOpen((o) => !o);
  }

  function pick(v: IconSelection) {
    onChange(v);
    setOpen(false);
  }

  // 选了文件：缩放为方形 PNG data URI，成功则作为「上传图片」选中并关浮层；失败提示。
  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // 清空 value，使同一文件可被再次选择（否则二次选同一文件不触发 change）。
    e.target.value = '';
    if (!file) return;
    try {
      const src = await fileToIconDataUri(file);
      onChange({ t: 'image', src });
      setOpen(false);
    } catch (err: any) {
      onUploadError?.(t('agents.uploadImageFail', { error: err?.message ?? String(err) }));
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function close() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', close, true); // capture：捕捉任意可滚动祖先
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const isImage = value.t === 'image';

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        disabled={disabled}
        title={t('agents.changeIcon')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className="icon-avatar"
      >
        {value.t === 'brand' ? (
          <img className="h-6 w-6" src={TOOL_ICON[value.key]} alt="" draggable={false} />
        ) : isImage ? (
          <img className="h-7 w-7 rounded-md object-contain" src={value.src} alt="" draggable={false} />
        ) : (
          <span className="flex size-7 items-center justify-center rounded-md bg-[#71717a] text-[13px] font-semibold text-white">
            {autoLetter || '?'}
          </span>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            className="icon-popover"
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            role="dialog"
            aria-label={t('agents.iconLabel')}
          >
            <div className="icon-popover-title">{t('agents.iconLabel')}</div>
            <div className="icon-popover-grid" role="radiogroup">
              {/* 上传图片：网格首格，点选触发系统文件框；选中后显示该图，点「自动/品牌」可清除 */}
              <button
                type="button"
                title={isImage ? t('agents.changeImage') : t('agents.uploadImage')}
                aria-label={isImage ? t('agents.changeImage') : t('agents.uploadImage')}
                onClick={() => fileInputRef.current?.click()}
                className={`flex size-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted/50 ${
                  isImage
                    ? 'border-transparent ring-2 ring-ring'
                    : 'border-dashed border-border'
                }`}
              >
                {isImage ? (
                  <img className="h-6 w-6 rounded object-contain" src={value.src} alt="" draggable={false} />
                ) : (
                  <svg
                    className="size-4 text-muted-foreground"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 15V3" />
                    <path d="M8 7l4-4 4 4" />
                    <path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={value.t === 'auto'}
                title={t('agents.iconAuto')}
                onClick={() => pick({ t: 'auto' })}
                className={`relative flex size-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted/50 ${
                  value.t === 'auto' ? 'border-transparent ring-2 ring-ring' : 'border-border'
                }`}
              >
                <span className="flex size-6 items-center justify-center rounded-md bg-[#71717a] text-[12px] font-semibold text-white">
                  {autoLetter || '?'}
                </span>
              </button>
              {ICON_CHOICES.map((c) => {
                const selected = value.t === 'brand' && value.key === c.key;
                const isRec = recommend === c.key;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    key={c.key}
                    title={c.label + (isRec ? ` · ${t('agents.iconRecommend')}` : '')}
                    onClick={() => pick({ t: 'brand', key: c.key })}
                    className={`relative flex size-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted/50 ${
                      selected ? 'border-transparent ring-2 ring-ring' : 'border-border'
                    }`}
                  >
                    <img className="h-5 w-5" src={c.url} alt={c.label} draggable={false} />
                    {isRec && (
                      <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1 text-[9px] font-medium leading-[1.3] text-accent-foreground">
                        {t('agents.iconRecommendShort')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {/* 隐藏文件输入：由上传图块 click() 触发；放在浮层内，仅浮层打开时存在 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFileChange}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

// ===== 关于 =====
function AboutSection() {
  const { t } = useI18n();
  const [version, setVersion] = useState('');
  const { info, phase, checkState, progress, check, apply } = useUpdate();

  useEffect(() => {
    window.skillkit.getVersion().then((v) => setVersion(v)).catch(() => {});
  }, []);

  const phaseLabel =
    phase === 'downloading'
      ? progress?.phase === 'retrying'
        ? t('about.retrying', { attempt: progress.attempt, max: progress.maxAttempts })
        : progress && progress.percent != null
          ? t('about.downloadingProgress', {
              percent: Math.floor(progress.percent),
              speed: formatSpeed(progress.speedBps),
              done: formatBytes(progress.transferred),
              total: progress.total ? formatBytes(progress.total) : '?',
            })
          : t('about.downloading')
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
