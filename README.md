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

仅起分享服务：`npm run server`（默认 `0.0.0.0:8787`）。客户端默认连 `https://skillkit.net`，本地联调需覆盖基地址：`SKILLKIT_SHARE_BASE_URL=http://127.0.0.1:8787 npm run dev`。

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

- **创建**：在「我的 Skill」对某个 skill 点分享 → 打包成 zip 上传到分享服务，返回短链（`<BASE>/api/share/<id>`），任何人 7 天内可安装
- **安装**：「安装 Skill」粘贴短链 / 完整 URL / 裸 ID 即可安装
- **接收页**：浏览器打开链接会看到一个说明如何安装的 HTML 页面
- 限制：单个 skill ≤ 4MB（受 Vercel 函数请求体上限约束）；7 天后过期（过期读时即返回 410）

分享服务一套代码两种运行模式（靠入口文件 + 环境变量切换，不改逻辑）：

- **阿里云 / 本地**：长驻进程（`server/src/index.ts` 的 `@hono/node-server` serve），本地文件存储（`server/data/`），每小时清理过期项。`npm run server` 启动，默认 `0.0.0.0:8787`。
- **Vercel**：serverless 函数（`api/[[...route]].ts` 用 `hono/vercel` 适配同一个 `app`），存储用 Vercel Blob（私有），每日 cron 清理。push 到 GitHub 自动部署到 `skillkit.net`。

存储实现由 `SHARE_STORE` 环境变量选（默认 `local`，Vercel 设 `blob`）；常量（TTL、上限、基地址）集中在 `shared/types.ts`。客户端默认连 `https://skillkit.net`，本地联调用 `SKILLKIT_SHARE_BASE_URL` 覆盖。

### Vercel 部署

- Vercel 项目 Root Directory 留**仓库根**（`shared/` 是 `server/` 的兄弟目录，根设为 `server/` 会丢 `shared/`，import 断裂）
- `vercel.json`：`framework:null` 关掉 Vite/Electron 自动识别；`installCommand` 用 `--omit=dev --ignore-scripts` 跳过 Electron/better-sqlite3 的安装后脚本（编译/下载都不需要）
- 环境变量：`SHARE_STORE=blob`、`BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`（保护 `/api/sweep`）
- `.vercelignore` 排除 `electron/`、`src/`、`build/` 等只与桌面端相关的目录

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
server/          分享服务（一套代码两种运行模式）
  src/app.ts     无副作用 Hono app（basePath /api），所有路由
  src/index.ts   阿里云/本地入口：serve + 每小时清理 + --delete CLI
  src/store.ts   ShareStore 接口 + getStore() 工厂 + 本地 fs 实现
  src/store-blob.ts  Vercel Blob（私有）实现
  data/          本地模式的 <id>.json + <id>.zip（git 忽略）
api/[[...route]].ts  Vercel 入口：hono/vercel handle(app)
shared/
  types.ts       跨进程共享类型（含分享常量）
vercel.json      Vercel 部署配置（framework/installCommand/cron）
.vercelignore    排除桌面端目录
src/             React 渲染端
  components/    TopBar / SkillCard / ToolBadge / ToolPicker / ShareDialog / Toast
  views/         MySkillsView / MarketView / InstallView
  styles/        暖色暗调主题
```
