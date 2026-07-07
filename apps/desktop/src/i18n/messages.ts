import type { Locale } from '@shared/types';

export const LOCALES: Locale[] = ['zh', 'en'];

// 翻译字典：zh 为键的真相源；en 必须同构（Record<keyof typeof zh, string>）。
// 当前覆盖：顶栏 Tab + 设置齿轮 + 设置弹窗全部文案。其余视图暂保持中文，后续增量补齐。
const zh = {
  'tab.my': '我的 Skill',
  'tab.install': '安装 Skill',

  'settings.gear': '设置',
  'settings.title': '设置',
  'settings.close': '关闭',
  'settings.nav.account': '账号',
  'settings.nav.appearance': '外观',
  'settings.nav.language': '语言',
  'settings.nav.space': '空间',
  'settings.nav.about': '关于',

  'account.loading': '读取账号中…',
  'account.signedIn': '已登录账号',
  'account.notSignedIn': '未登录 Skillkit 账号',
  'account.loginHint': '登录后可同步账号信息。',
  'account.emailLabel': '邮箱',
  'account.passwordLabel': '密码',
  'account.loginBtn': '登录',
  'account.loggingIn': '登录中…',
  'account.loginFailed': '登录失败',
  'account.logout': '登出',
  'account.register': '没有账号？去注册',
  'account.manage': '在网页中管理账号',
  'account.nameFallback': '（未设置昵称）',

  'appearance.label': '主题外观',
  'appearance.dark': '深色',
  'appearance.light': '浅色',
  'appearance.system': '跟随系统',

  'language.label': '界面语言',
  'language.zh': '简体中文',
  'language.en': 'English',

  'space.label': 'Skill 存储空间',
  'space.globalRepo': '全局仓库',
  'space.globalRepoDesc': '与 npx skills 互通的共享目录（跨工具软链接到此）。',
  'space.reveal': '打开目录',
  'space.loadError': '无法读取路径',

  'about.label': '关于 Skillkit',
  'about.version': '版本',
  'about.checkUpdate': '检查更新',
  'about.checking': '检查中…',
  'about.upToDate': '已是最新版本',
  'about.newVersion': '发现新版本 v{version}',
  'about.update': '下载并更新',
  'about.downloading': '正在下载更新…',
  'about.done': '已下载 v{version}，请在弹出的安装窗口完成更新',
  'about.updateError': '下载失败，点此重试',
};

const en: Record<keyof typeof zh, string> = {
  'tab.my': 'My Skills',
  'tab.install': 'Install Skill',

  'settings.gear': 'Settings',
  'settings.title': 'Settings',
  'settings.close': 'Close',
  'settings.nav.account': 'Account',
  'settings.nav.appearance': 'Appearance',
  'settings.nav.language': 'Language',
  'settings.nav.space': 'Space',
  'settings.nav.about': 'About',

  'account.loading': 'Loading account…',
  'account.signedIn': 'Signed in',
  'account.notSignedIn': 'Not signed in to Skillkit',
  'account.loginHint': 'Sign in to sync your account info.',
  'account.emailLabel': 'Email',
  'account.passwordLabel': 'Password',
  'account.loginBtn': 'Sign in',
  'account.loggingIn': 'Signing in…',
  'account.loginFailed': 'Sign-in failed',
  'account.logout': 'Sign out',
  'account.register': "Don't have an account? Register",
  'account.manage': 'Manage account on the web',
  'account.nameFallback': '(no nickname set)',

  'appearance.label': 'Theme',
  'appearance.dark': 'Dark',
  'appearance.light': 'Light',
  'appearance.system': 'System',

  'language.label': 'Language',
  'language.zh': '简体中文',
  'language.en': 'English',

  'space.label': 'Skill storage',
  'space.globalRepo': 'Global repo',
  'space.globalRepoDesc': 'Shared directory interoperable with npx skills (symlinked by each tool).',
  'space.reveal': 'Reveal folder',
  'space.loadError': 'Unable to read path',

  'about.label': 'About Skillkit',
  'about.version': 'Version',
  'about.checkUpdate': 'Check for updates',
  'about.checking': 'Checking…',
  'about.upToDate': 'You are on the latest version',
  'about.newVersion': 'New version v{version} available',
  'about.update': 'Download & update',
  'about.downloading': 'Downloading update…',
  'about.done': 'Downloaded v{version}. Complete the update in the installer window.',
  'about.updateError': 'Download failed. Retry',
};

export type MessageKey = keyof typeof zh;

export const messages: Record<Locale, Record<MessageKey, string>> = { zh, en };
