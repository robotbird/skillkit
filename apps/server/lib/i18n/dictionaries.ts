import type { Locale } from './config';

// 全量文案:扁平点分 key → 串。{name}/{count}/{date}/{id}/{n} 为占位符。
// 改文案只改这里;新增 key 时 zh/en 都要补。
export const dict: Record<Locale, Record<string, string>> = {
  zh: {
    // —— 根 metadata ——
    'meta.description': 'Skillkit 分享与团队 skill 管理',

    // —— 通用错误(API 返回 / Zod / 客户端兜底) ——
    'errors.invalidCredentials': '邮箱或密码错误',
    'errors.emailTaken': '该邮箱已注册',
    'errors.invalidParams': '参数不合法',
    'errors.userNotFound': '用户不存在',
    'errors.wrongCurrentPassword': '当前密码不正确',
    'errors.shareNotFound': '分享不存在或无权操作',
    'errors.unauthorized': '未登录或会话已过期',
    'errors.server': '服务器错误',
    'errors.emailInvalid': '邮箱格式不正确',
    'errors.passwordRequired': '请输入密码',
    'errors.passwordMin': '密码至少 8 位',
    'errors.passwordMax': '密码最多 72 位',
    'errors.currentPasswordRequired': '请输入当前密码',
    'errors.newPasswordMin': '新密码至少 8 位',
    'errors.nameMax': '昵称最多 40 字',
    'errors.loginFailed': '登录失败',
    'errors.registerFailed': '注册失败',
    'errors.passwordUpdateFailed': '修改失败',
    'errors.saveFailed': '保存失败',
    'errors.deleteFailed': '删除失败',
    'errors.passwordMismatch': '两次输入的新密码不一致',

    // —— 登录 ——
    'auth.login.title': '登录 Skillkit',
    'auth.login.desc': '登录后管理你的分享。',
    'auth.login.email': '邮箱',
    'auth.login.password': '密码',
    'auth.login.submit': '登录',
    'auth.login.submitting': '登录中…',
    'auth.login.noAccount': '还没账号？',
    'auth.login.register': '注册',

    // —— 注册 ——
    'auth.register.title': '注册 Skillkit',
    'auth.register.desc': '创建账号，开始管理分享。',
    'auth.register.email': '邮箱',
    'auth.register.password': '密码',
    'auth.register.passwordHint': '至少 8 位',
    'auth.register.name': '昵称（可选）',
    'auth.register.submit': '注册',
    'auth.register.submitting': '注册中…',
    'auth.register.haveAccount': '已有账号？',
    'auth.register.login': '登录',

    // —— 侧栏导航 / 外壳 ——
    'nav.overview': '总览',
    'nav.shares': '分享的 skill',
    'shell.back': '返回',

    // —— 用户菜单 ——
    'userMenu.ariaLabel': '账号菜单',
    'userMenu.accountSettings': '账号设置',
    'userMenu.logout': '退出登录',
    'userMenu.loggingOut': '退出中…',

    // —— 总览页 ——
    'dashboard.greeting': '你好，{name}',
    'dashboard.subtitle': '管理你的账号与分享的 skill。',
    'dashboard.sharesStatLabel': '个分享',
    'dashboard.storageLabel': '存储占用',
    'dashboard.sharesCardTitle': '分享',
    'dashboard.sharesCardDesc': '你分享过的 skill 短链。',
    'dashboard.sharesCountPrefix': '已分享 ',
    'dashboard.sharesCountSuffix': ' 个 skill',
    'dashboard.viewAll': '查看 →',
    'dashboard.accountCardTitle': '账号',
    'dashboard.accountCardDesc': '昵称与邮箱。',
    'dashboard.emailLabel': '邮箱',
    'dashboard.joinedAt': '注册于 {date}',

    // —— 账号设置页 ——
    'account.title': '账号设置',
    'account.subtitle': '账号信息与密码。',
    'account.infoCardTitle': '账号信息',
    'account.infoCardDesc': '你的账号基本资料。',
    'account.emailLabel': '邮箱',
    'account.joinedAt': '注册于 {date}',
    'account.passwordCardTitle': '修改密码',
    'account.passwordCardDesc': '更新后其他设备需用新密码重新登录。',

    // —— 昵称表单 ——
    'editName.nameLabel': '昵称',
    'editName.placeholder': '可选',
    'editName.save': '保存',
    'editName.saving': '保存中…',
    'editName.saved': '已保存',

    // —— 改密表单 ——
    'password.currentLabel': '当前密码',
    'password.newLabel': '新密码',
    'password.hint': '至少 8 位',
    'password.confirmLabel': '确认新密码',
    'password.submit': '更新密码',
    'password.submitting': '更新中…',
    'password.success': '密码已更新，其他设备需用新密码重新登录',

    // —— 分享列表页 ——
    'shares.title': '分享的 skill',
    'shares.subtitle': '你分享过的 skill 短链，共 {count} 条。',
    'shares.empty': '还没有分享过 skill。',
    'shares.col.name': '名称',
    'shares.col.link': '链接',
    'shares.col.time': '分享时间',
    'shares.col.size': '大小',
    'shares.moreActions': '更多操作',
    'shares.delete': '删除',
    'shares.deleteTitle': '删除这个分享？',
    'shares.deleteDesc': '将删除短链与文件，此操作无法撤销。',
    'shares.cancel': '取消',

    // —— 分享接收页(/share/[id],route handler 自渲染 HTML) ——
    'share.titleWord': '分享',
    'share.ogDescDefault':
      '通过 Skillkit 分享的 AI skill —— 7 天内可一键安装到 Claude Code / Codex / Cursor / Trae / Workbuddy。',
    'share.kicker': 'SKILLKIT 分享',
    'share.notFoundTitle': '链接不存在',
    'share.notFoundDesc': '分享 {id} 不存在或已被清理。',
    'share.expiredTitle': '已过期',
    'share.expiredDesc': '分享 {id} 已经过期。',
    'share.expiresToday': '今天到期',
    'share.expiresIn': '{n} 天后过期',
    'share.openInSkillkit': '从 Skillkit 打开',
    'share.downloadZip': '下载压缩包',
    'share.copyLink': '复制链接',
    'share.copied': '已复制',
    'share.noApp': '没有 Skillkit？',
    'share.downloadApp': '下载桌面端 →',
    'share.footer': '由 Skillkit 分享 · 链接 7 天内有效',
    'share.toggleInitialAria': '切换深色 / 浅色主题',
    'share.toggleToDark': '切换到深色模式',
    'share.toggleToLight': '切换到浅色模式',
  },

  en: {
    // —— root metadata ——
    'meta.description': 'Skillkit — share and manage your AI skills',

    // —— errors ——
    'errors.invalidCredentials': 'Invalid email or password',
    'errors.emailTaken': 'Email already registered',
    'errors.invalidParams': 'Invalid input',
    'errors.userNotFound': 'User not found',
    'errors.wrongCurrentPassword': 'Current password is incorrect',
    'errors.shareNotFound': 'Share not found or no permission',
    'errors.unauthorized': 'Not signed in or session expired',
    'errors.server': 'Server error',
    'errors.emailInvalid': 'Invalid email format',
    'errors.passwordRequired': 'Please enter your password',
    'errors.passwordMin': 'Password must be at least 8 characters',
    'errors.passwordMax': 'Password must be at most 72 characters',
    'errors.currentPasswordRequired': 'Please enter your current password',
    'errors.newPasswordMin': 'New password must be at least 8 characters',
    'errors.nameMax': 'Nickname must be at most 40 characters',
    'errors.loginFailed': 'Sign-in failed',
    'errors.registerFailed': 'Registration failed',
    'errors.passwordUpdateFailed': 'Update failed',
    'errors.saveFailed': 'Save failed',
    'errors.deleteFailed': 'Delete failed',
    'errors.passwordMismatch': "The new passwords don't match",

    // —— login ——
    'auth.login.title': 'Sign in to Skillkit',
    'auth.login.desc': 'Manage your shares after signing in.',
    'auth.login.email': 'Email',
    'auth.login.password': 'Password',
    'auth.login.submit': 'Sign in',
    'auth.login.submitting': 'Signing in…',
    'auth.login.noAccount': 'No account yet? ',
    'auth.login.register': 'Sign up',

    // —— register ——
    'auth.register.title': 'Create a Skillkit account',
    'auth.register.desc': 'Create an account to start managing shares.',
    'auth.register.email': 'Email',
    'auth.register.password': 'Password',
    'auth.register.passwordHint': 'At least 8 characters',
    'auth.register.name': 'Nickname (optional)',
    'auth.register.submit': 'Sign up',
    'auth.register.submitting': 'Signing up…',
    'auth.register.haveAccount': 'Already have an account? ',
    'auth.register.login': 'Sign in',

    // —— nav / shell ——
    'nav.overview': 'Overview',
    'nav.shares': 'Shared skills',
    'shell.back': 'Back',

    // —— user menu ——
    'userMenu.ariaLabel': 'Account menu',
    'userMenu.accountSettings': 'Account settings',
    'userMenu.logout': 'Sign out',
    'userMenu.loggingOut': 'Signing out…',

    // —— overview ——
    'dashboard.greeting': 'Hello, {name}',
    'dashboard.subtitle': 'Manage your account and shared skills.',
    'dashboard.sharesStatLabel': 'shares',
    'dashboard.storageLabel': 'Storage used',
    'dashboard.sharesCardTitle': 'Shares',
    'dashboard.sharesCardDesc': 'Your shared skill links.',
    'dashboard.sharesCountPrefix': '',
    'dashboard.sharesCountSuffix': ' skills shared',
    'dashboard.viewAll': 'View all →',
    'dashboard.accountCardTitle': 'Account',
    'dashboard.accountCardDesc': 'Nickname and email.',
    'dashboard.emailLabel': 'Email',
    'dashboard.joinedAt': 'Joined {date}',

    // —— account ——
    'account.title': 'Account settings',
    'account.subtitle': 'Account info and password.',
    'account.infoCardTitle': 'Account info',
    'account.infoCardDesc': 'Your basic profile.',
    'account.emailLabel': 'Email',
    'account.joinedAt': 'Joined {date}',
    'account.passwordCardTitle': 'Change password',
    'account.passwordCardDesc':
      'Other devices will need to sign in again with the new password.',

    // —— edit name ——
    'editName.nameLabel': 'Nickname',
    'editName.placeholder': 'Optional',
    'editName.save': 'Save',
    'editName.saving': 'Saving…',
    'editName.saved': 'Saved',

    // —— change password ——
    'password.currentLabel': 'Current password',
    'password.newLabel': 'New password',
    'password.hint': 'At least 8 characters',
    'password.confirmLabel': 'Confirm new password',
    'password.submit': 'Update password',
    'password.submitting': 'Updating…',
    'password.success':
      'Password updated. Other devices will need to sign in again.',

    // —— shares ——
    'shares.title': 'Shared skills',
    'shares.subtitle': 'Your shared skill links, {count} total.',
    'shares.empty': 'No shared skills yet.',
    'shares.col.name': 'Name',
    'shares.col.link': 'Link',
    'shares.col.time': 'Shared',
    'shares.col.size': 'Size',
    'shares.moreActions': 'More actions',
    'shares.delete': 'Delete',
    'shares.deleteTitle': 'Delete this share?',
    'shares.deleteDesc':
      'This will remove the short link and file. This cannot be undone.',
    'shares.cancel': 'Cancel',

    // —— share receiver page ——
    'share.titleWord': 'Share',
    'share.ogDescDefault':
      'An AI skill shared via Skillkit — install it into Claude Code / Codex / Cursor / Trae / Workbuddy in one click. Valid for 7 days.',
    'share.kicker': 'SKILLKIT SHARE',
    'share.notFoundTitle': 'Link not found',
    'share.notFoundDesc': "Share {id} doesn't exist or was removed.",
    'share.expiredTitle': 'Expired',
    'share.expiredDesc': 'Share {id} has expired.',
    'share.expiresToday': 'Expires today',
    'share.expiresIn': 'Expires in {n} days',
    'share.openInSkillkit': 'Open in Skillkit',
    'share.downloadZip': 'Download zip',
    'share.copyLink': 'Copy link',
    'share.copied': 'Copied',
    'share.noApp': "Don't have Skillkit? ",
    'share.downloadApp': 'Download desktop app →',
    'share.footer': 'Shared via Skillkit · Link valid for 7 days',
    'share.toggleInitialAria': 'Toggle dark / light theme',
    'share.toggleToDark': 'Switch to dark mode',
    'share.toggleToLight': 'Switch to light mode',
  },
};
