# Skillkit v2

Skill 管理工具 — 浏览 [skills.sh](https://www.skills.sh) 市场，跨工具（Claude Code / Codex / Cursor / Trae）安装与卸载 skill。

技术栈：**React 18 + TypeScript + Vite + Electron + better-sqlite3**

## 启动

```bash
npm install
npm run rebuild   # 适配 better-sqlite3 的 abi
npm run dev       # vite + electron 一起起
```

## 三个 tab

- **我的 Skill** — 自动扫描 `~/.claude/skills`、`~/.codex/skills`、`~/.cursor/skills(-cursor)`、`~/.trae/skills` 与 `~/.trae/builtin_skills`，按工具筛选 / 搜索 / grid·list 切换 / 卸载（内置 skill 不可卸载）
- **Skill 市场** — 从 skills.sh 的 sitemap 拉全量 skill 列表（24h 缓存于 SQLite），分页 + 搜索；卡片描述按需懒加载（解析详情页 JSON-LD）
- **安装 Skill** — 顶部多选要安装到的工具（默认 Claude Code），下方两种方式：GitHub URL / 上传 .zip

## 数据存储

- SQLite 数据库：`~/Library/Application Support/skillkit/skillkit.db`
- 表：`installed_skills`、`market_skills`、`meta`

## 安装行为

- 从市场 / GitHub：调用 `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD`，解出对应 skill 子目录后用 `cp` 复制到目标工具的 install root（已存在会先备份再覆盖，失败回滚）
- 从 zip：本地解压找含 `SKILL.md` 的最浅目录，按同样规则复制
- 多目标：每个目标独立处理；单个失败不影响其他

## 目录

```
electron/
  main.ts        BrowserWindow + IPC 注册
  preload.ts     contextBridge 暴露 window.skillkit
  db.ts          better-sqlite3 + 迁移
  tools.ts       四个工具的 root / installRoot 约定
  skill-md.ts    SKILL.md frontmatter 解析（无三方依赖）
  scan.ts        扫描所有 root → upsert 到 db
  market.ts      sitemap + 详情页抓取 + 缓存
  installer.ts   tarball / zip 解 + 复制到目标工具
  ipc.ts         IPC handlers
shared/
  types.ts       跨进程共享类型
src/             React 渲染端
  components/    TopBar / SkillCard / ToolBadge / ToolPicker / Toast
  views/         MySkillsView / MarketView / InstallView
  styles/        暖色暗调主题
```
