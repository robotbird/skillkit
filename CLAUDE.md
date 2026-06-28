# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Skillkit — manage "skills" across AI coding tools (Claude Code, Codex, Cursor, Trae, Workbuddy): browse the [skills.sh](https://www.skills.sh) marketplace, install/uninstall from market/GitHub/zip, and share installed skills via short links. A **pnpm-workspace monorepo** with three parts:

- **`apps/desktop`** — Electron desktop client (React 18 + TypeScript + Vite + better-sqlite3).
- **`apps/server`** — Next.js 16 (App Router) full-stack service: the share short-link API + (future) web 个人中心 / 团队 skill 管理. Deployed to Vercel.
- **`packages/types`** — `@skillkit/types`: cross-process shared types & constants (single source of truth).

The marketing site (官网) is a **separate repo** at `../skillkit.net`, not part of this monorepo.

## Commands

Run from the repo root. Each app also has its own scripts (`pnpm --filter <name> <script>`).

```bash
pnpm install                 # workspace install (links @skillkit/types, installs apps/desktop + apps/server deps)

# Desktop (apps/desktop)
pnpm --filter desktop rebuild   # REQUIRED: rebuilds better-sqlite3 against Electron's ABI. Run after install / Electron bumps.
pnpm --filter desktop dev       # Full Electron app in dev (vite-plugin-electron launches Electron + watches all 3 bundles)
pnpm --filter desktop build     # tsc -p both tsconfigs (typecheck, noEmit) + vite build
pnpm --filter desktop pack      # build + electron-builder --dir (unpacked, for debugging)
pnpm --filter desktop dist      # build + electron-builder → release/ (mac dmg/zip, win nsis)

# Server (apps/server)
pnpm --filter server dev        # next dev (port 3000)
pnpm --filter server build      # next build
SHARE_STORE=local pnpm --filter server dev   # local file store (no Blob token needed)

# Repo-wide (turbo)
pnpm dev        # turbo dev — runs desktop + server dev in parallel
pnpm build      # turbo build
pnpm typecheck  # turbo typecheck
```

There is **no test framework**. Typechecking: desktop via its `typecheck` script (`tsc -p` both tsconfigs); server via `next build` (which typechecks) or `tsc --noEmit`.

## Architecture

### Monorepo layout

```
apps/desktop/   electron/ src/ shared/ build/ public/ vite.config.ts tsconfig*.json
apps/server/    app/ lib/ next.config.ts tsconfig.json vercel.json
packages/types/ src/index.ts            # @skillkit/types
pnpm-workspace.yaml  turbo.json  package.json (root: devDeps + turbo scripts only)
```

### `packages/types` (`@skillkit/types`)

Cross-end symbols consumed by **both** desktop and server: `Tool`, `TOOL_LABELS`, `ALL_TOOLS`, `InstalledSkill`, `MarketSkill`, `InstallResult`, `InstalledFilter`, `Market*`, `ShareMeta`, `ShareCreateResult`, `ShareSourceInfo`, and share constants (`SHARE_BASE_URL`, `SHARE_TTL_MS`, `SHARE_MAX_BYTES`). **Single source of truth** — the old `api/lib/types.ts` manual subset-copy is gone.

It is **pure TS with no build step**. Each consumer must teach its bundler to compile it:
- **desktop** (`apps/desktop/vite.config.ts`): `resolve.alias['@skillkit/types'] → ../../packages/types/src` in **all three** vite bundles (renderer / electron main / preload).
- **server** (`apps/server/next.config.ts`): `transpilePackages: ['@skillkit/types']`.

### Desktop: three-process Electron model

`apps/desktop/electron/` (main, ESM, → `dist-electron/`), `apps/desktop/electron/preload.ts` (→ `preload.mjs`), `apps/desktop/src/` (React renderer, → `dist/`).

- **`shared/types.ts` is now a bridge layer** (NOT the source of truth): it re-exports the cross-end symbols from `@skillkit/types` **plus** defines desktop-only types (`UpdateAvailableInfo`, the `SkillkitApi` IPC contract, the `Window` global). Main process imports it as `../shared/types.js`; renderer as `@shared/types`. Keeping `shared/` inside `apps/desktop/` means **both paths stayed identical after the monorepo move** — no import rewrites were needed.
- **Adding a main-process capability still needs three coordinated edits**: an IPC handler in `electron/ipc.ts`, a method on `window.skillkit` in `electron/preload.ts`, **and** the matching signature in `shared/types.ts` (`SkillkitApi`).
- The `@shared` alias → `shared/` is wired in `apps/desktop/vite.config.ts` (renderer + main) and both `apps/desktop/tsconfig*.json`. Both use `moduleResolution: bundler`, so `@skillkit/types` resolves via the workspace symlink + its `exports` field — no tsconfig `paths` needed for it.

### ESM `.js` import gotcha

The project is `"type": "module"`. Files under `apps/desktop/electron/` import each other with explicit `.js` extensions (`from './db.js'` resolves to `db.ts`) because tsc/vite emit ESM. **Always use `.js` in local relative imports there**; omitting it breaks the built output.

### Desktop main-process modules (`apps/desktop/electron/`)

- **`db.ts`** — better-sqlite3, WAL. Tables: `installed_skills`, `market_skills`, `meta` (KV). One-time legacy migration copies the DB from the old `skillzix` userData dir to `skillkit`.
- **`tools.ts`** — `TOOLS` config: each tool's `roots[]`, `installRoot`, optional `builtinRoot`. Cursor scans two roots (`skills` + `skills-cursor`); Trae marks `~/.trae/builtin_skills` as builtin (not uninstallable).
- **`scan.ts`** — `scanAll()` scans every tool's roots and **clears + rewrites the entire `installed_skills` table**. **The filesystem is the source of truth; the DB is a cache.** Any installed-skill state you add must be reconstructable by a scan, or it will be wiped. IPC handlers call `scanAll()` after any install/uninstall/copy.
- **`installer.ts`** — market/GitHub installs fetch `codeload.github.com/<owner>/<repo>/tar.gz/HEAD`, extract via `tar`, locate the skill subdir; zip installs use `adm-zip` and find the shallowest dir containing `SKILL.md`. Existing installs are backed up then overwritten, rolling back on failure. Multi-target installs are independent.
- **`market.ts`** — pulls `skills.sh` sitemap XML, lazy-scrapes card descriptions from detail-page JSON-LD (`SoftwareApplication`), cached in SQLite with a **24h TTL**. `OFFICIAL_OWNERS = {anthropics, vercel-labs, microsoft}`.
- **`skill-md.ts`** — dependency-free YAML frontmatter parser; reads `SKILL.md` **or** `AGENTS.md`.
- **`share.ts`** — client side of sharing: zip an installed skill, POST to the server, inspect/install from a share link. Calls `${SHARE_BASE_URL}/share`, `/share/:id/meta`, `/share/:id/zip` (no `/api` prefix).
- **`updater.ts`** — electron-updater: background check, pushes "update available" to the renderer.
- **`warehouse.ts`** — a unified "原件" warehouse dir for skills.

### Server: Next.js App Router (`apps/server`)

Share short-link service, soon to grow a logged-in 个人中心 / 团队管理 (reserved under `app/(dashboard)/`). Replaces the old Hono `api/` + `server/` dual-entry.

**Public paths are clean and MUST stay stable** (desktop `share.ts` calls them, and existing short links depend on them): so these route handlers live **directly under `app/share/` and `app/sweep/`, NOT under `app/api/`** — `/share` (POST), `/share/[id]` (HTML receiver), `/share/[id]/meta` (JSON), `/share/[id]/zip` (download), `/sweep` (cron). Only `/api/health` sits under `api/`.

- **`app/share/[id]/route.ts`** — the receiver page returns a **full HTML document** via route handler (not `page.tsx`): inlined CSS/JS, OG/Twitter card, theme toggle, copy-link, `skillkit://share/<id>` deep-link button, HTML-escaped user content. `generateMetadata` is not used (the HTML carries its own `<head>`). `TOOL_LABELS` comes from `@skillkit/types`; `TOOL_COLOR` is a local display constant.
- **`lib/store.ts`** — `ShareStore` interface + `getStore()` (cached). `LocalStore` (filesystem, for local dev) vs `BlobStore` (`lib/store-blob.ts`, Vercel Blob **public**), selected by `SHARE_STORE` env. `getStore()` loads BlobStore via **dynamic import**, so local dev never needs `@vercel/blob`. `LocalStore`'s data dir defaults to `<cwd>/data` (override `SHARE_LOCAL_DIR`). Async throughout. 6-char nanoid IDs (`lib/id.ts`), 7-day TTL, **4MB cap** (Vercel 4.5MB body limit; Pro does not raise it).

**Sweep**: Vercel daily cron hits `/sweep` (see `apps/server/vercel.json` `crons`), guarded by `CRON_SECRET` (Bearer). Expired shares already return 410 on read, so sweep is cost-only.

**Vercel deploy**:
- **Root Directory** = `apps/server`。
- **Framework Preset 必须显式选 `Next.js`** —— 若留在 "Other"(迁移前 api-only 的遗留)会报 `No Output Directory "public"`(Vercel 没识别成 Next.js)。
- **Ignored Build Step**(Settings → Git):`bash vercel-ignored-build-step.sh`(命令相对 Root Directory;脚本内部 `cd` 仓库根,仅 `apps/server`/`packages/types` 变更才继续部署,改 `apps/desktop` 自动跳过)。
- **Install Command**:`apps/server/vercel.json` 设 `pnpm install --filter server...`,只装 server 依赖树,跳过 desktop 的 electron/better-sqlite3 原生编译。
- Build/Output 留空(Next.js 自动 `.next`)。Env:`SHARE_STORE=blob`、`BLOB_READ_WRITE_TOKEN`、`CRON_SECRET`。
- 标准的 Next.js 部署,旧的 `framework:null`/`--ignore-scripts`/catch-all 补丁都不再适用。

**Domain note**: `SHARE_BASE_URL` defaults to `https://skillkit.net` (override locally with `SKILLKIT_SHARE_BASE_URL`). Whether the server keeps `skillkit.net` or moves to a subdomain (with the 官网 taking the root) is an open deploy decision — changing it breaks existing short links.

### CI

`.github/workflows/build.yml` packages the desktop app (mac arm64/x64, win x64) on push to main (path-ignores `apps/server/**`, `docs/**`, `*.md`). Uses **pnpm** (`pnpm/action-setup` + `actions/setup-node` cache: pnpm), installs at repo root, then `pnpm run rebuild`/`build`/`electron-builder` with `working-directory: apps/desktop`. `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` (signing off; see the yml comments to enable). Release via `workflow_dispatch` + `softprops/action-gh-release`; `electron-updater` publishes to `github:robotbird/skillkit`.

### Data locations

- App DB: `~/Library/Application Support/skillkit/skillkit.db`
- Installed skills: each tool's user-level dir under `~` (`~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.trae/skills`, …)
- Local share store (dev only): `apps/server/data/` (gitignored except `README.md`).
