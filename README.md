# Skillkit v2

Skill 管理工具 — 浏览 [skills.sh](https://www.skills.sh) 市场，跨工具（Claude Code / Codex / Cursor / Trae）安装与卸载 skill。

技术栈：**React 18 + TypeScript + Vite + Electron + better-sqlite3**

## 启动

```bash
npm install
npm run rebuild   # 适配 better-sqlite3 的 abi
npm run dev       # vite + electron 一起起（不含分享服务）
```

分享功能依赖独立的分享服务（见下方「分享」）。本地联调：

```bash
cd server && npm install && cd ..   # server 是独立 npm 包
npm run dev:all   # 同时起 app(vite+electron) 与分享服务(8787)
```

仅起分享服务：`npm run server`（默认 `127.0.0.1:8787`）。客户端默认连云端，本地联调需覆盖基地址：`SKILLKIT_SHARE_BASE_URL=http://127.0.0.1:8787 npm run dev`。

## 三个 tab

- **我的 Skill** — 自动扫描 `~/.claude/skills`、`~/.codex/skills`、`~/.cursor/skills(-cursor)`、`~/.trae/skills` 与 `~/.trae/builtin_skills`，按工具筛选 / 搜索 / grid·list 切换 / 卸载（内置 skill 不可卸载）/ 分享（生成 7 天短链）
- **Skill 市场** — 从 skills.sh 的 sitemap 拉全量 skill 列表（24h 缓存于 SQLite），分页 + 搜索；卡片描述按需懒加载（解析详情页 JSON-LD）
- **安装 Skill** — 顶部多选要安装到的工具（默认 Claude Code），下方三种方式：GitHub URL / 分享链接 / 上传 .zip

## 数据存储

- SQLite 数据库：`~/Library/Application Support/skillkit/skillkit.db`
- 表：`installed_skills`、`market_skills`、`meta`

## 安装行为

- 从市场 / GitHub：调用 `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD`，解出对应 skill 子目录后用 `cp` 复制到目标工具的 install root（已存在会先备份再覆盖，失败回滚）
- 从 zip：本地解压找含 `SKILL.md` 的最浅目录，按同样规则复制
- 多目标：每个目标独立处理；单个失败不影响其他

## 分享

- **创建**：在「我的 Skill」对某个 skill 点分享 → 打包成 zip 上传到分享服务，返回短链（`<BASE>/share/<id>`），任何人 7 天内可安装
- **安装**：「安装 Skill」粘贴短链 / 完整 URL / 裸 ID 即可安装
- **接收页**：浏览器打开链接会看到一个说明如何安装的 HTML 页面
- 限制：单个 skill ≤ 20MB；7 天后自动清理

分享服务是 `server/` 下独立的 Hono 应用（自带 `package.json` / `node_modules`），用文件存储（`server/data/<id>.json` + `<id>.zip`），每小时清理过期项。默认连云端 `skillkit.bjjxysbz.com`；本地联调用 `SKILLKIT_SHARE_BASE_URL` 指向本地服务。常量（TTL、上限、基地址）集中在 `shared/types.ts`。

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
  share.ts       打包 / 上传 / 下载分享，对接分享服务
  ipc.ts         IPC handlers
server/          分享服务（独立 Hono 应用）
  src/index.ts   路由：上传 / 元数据 / 下载 zip / 接收页 HTML
  src/store.ts   文件存储 + 过期清理
  data/          <id>.json + <id>.zip（git 忽略）
shared/
  types.ts       跨进程共享类型（含分享常量）
src/             React 渲染端
  components/    TopBar / SkillCard / ToolBadge / ToolPicker / ShareDialog / Toast
  views/         MySkillsView / MarketView / InstallView
  styles/        暖色暗调主题
```
