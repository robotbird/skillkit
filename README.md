# Skillkit

Skill 管理工具 — 跨工具（Claude Code / Codex / Cursor / Trae / Workbuddy）浏览 [skills.sh](https://www.skills.sh) 市场，安装 / 卸载 skill，并通过短链分享。

技术栈：Electron（React 18 + TypeScript + Vite + better-sqlite3）桌面端 + Next.js 服务端，组织为 **pnpm workspace monorepo**。

## 仓库结构

- `apps/desktop` — Electron 桌面客户端
- `apps/server` — Next.js 服务端（分享短链 API + 未来 web 个人中心 / 团队管理）
- `packages/types` — `@skillkit/types`，跨端共享类型与常量（单一真相源）

> 官网（skillkit.net）是**独立仓库**，不在本仓库内。

## 启动

```bash
pnpm install
pnpm --filter desktop rebuild   # 适配 better-sqlite3 的 Electron ABI

pnpm --filter desktop dev       # 桌面端（vite + electron）
SHARE_STORE=local pnpm --filter server dev   # 服务端（本地文件存储，无需 Blob token）
pnpm dev                        # turbo 并行起两端
```

客户端默认连 `https://skillkit.net`；本地联调覆盖基地址：`SKILLKIT_SHARE_BASE_URL=http://127.0.0.1:3000 pnpm --filter desktop dev`（next dev 默认 3000）。

## 三个 tab（桌面端）

- **我的 Skill** — 自动扫描 `~/.claude/skills`、`~/.codex/skills`、`~/.cursor/skills(-cursor)`、`~/.trae/skills` 与 `~/.trae/builtin_skills`，按工具筛选 / 搜索 / grid·list 切换 / 卸载（内置 skill 不可卸载）/ 分享（生成 7 天短链）
- **Skill 市场** — 从 skills.sh 的 sitemap 拉全量 skill 列表（24h 缓存于 SQLite），分页 + 搜索；卡片描述按需懒加载（解析详情页 JSON-LD）
- **安装 Skill** — 顶部多选要安装到的工具，下方三种方式：GitHub URL / 分享链接 / 上传 .zip

## 数据存储

- SQLite：`~/Library/Application Support/skillkit/skillkit.db`（表 `installed_skills`、`market_skills`、`meta`）
- 已安装 skill：各工具用户目录（`~/.claude/skills` 等）

## 安装行为

- 从市场 / GitHub：调用 `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD`，解出对应 skill 子目录后复制到目标工具的 install root（已存在会先备份再覆盖，失败回滚）
- 从 zip：本地解压找含 `SKILL.md` 的最浅目录，按同样规则复制
- 多目标：每个目标独立处理；单个失败不影响其他

## 分享

- **创建**：在「我的 Skill」对某个 skill 点分享 → 打包成 zip 上传到服务端，返回短链（`https://skillkit.net/share/<id>`），7 天内可安装
- **安装**：「安装 Skill」粘贴短链 / 完整 URL / 裸 ID 即可
- **接收页**：浏览器打开链接看到一个 HTML 说明页
- 限制：单个 skill ≤ 4MB；7 天后过期（过期读时即返回 410）

服务端（`apps/server`，Next.js App Router）的公开路径是干净的 `/share`、`/share/:id`、`/share/:id/meta`、`/share/:id/zip`、`/sweep`（**不带 `/api` 前缀**，客户端契约依赖于此）。存储由 `SHARE_STORE` 选：`local`（本地文件 `apps/server/data/`，默认）或 `blob`（Vercel Blob）；常量集中在 `packages/types`。

### Vercel 部署（服务端）

- Vercel 项目 Root Directory = **`apps/server`**，Framework Preset 自动识别为 Next.js（Build/Install/Output 留空自动）
- 环境变量：`SHARE_STORE=blob`、`BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`（保护 `/sweep`）
- `apps/server/vercel.json` 配置每日 cron 命中 `/sweep`

### 打包发布（桌面端）

CI（`.github/workflows/build.yml`）在 push main 时用 pnpm 打包 mac（dmg/zip）+ win（nsis）；`workflow_dispatch` 触发 GitHub Release，electron-updater 据此推送更新。

## 目录

```
apps/desktop/
  electron/    主进程（main/ipc/preload/db/scan/installer/market/share/skill-md/tools/updater/warehouse）
  src/         React 渲染端（components/views/styles/lib）
  shared/      桥接层 types.ts（re-export @skillkit/types + desktop 专用 SkillkitApi 等）
  build/ public/ vite.config.ts tsconfig*.json
apps/server/
  app/         Next.js App Router：share/ sweep/ api/health（+ (dashboard) 预留）
  lib/         store.ts（接口 + 本地实现）/ store-blob.ts（Vercel Blob）/ id.ts
  next.config.ts  vercel.json  tsconfig.json
packages/types/    @skillkit/types（跨端类型与常量，单一真相源）
pnpm-workspace.yaml  turbo.json
```
