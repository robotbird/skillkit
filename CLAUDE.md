# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## What this is

Skillkit — manage "skills" across AI coding tools (Claude Code, Codex, Cursor, Trae, Workbuddy): browse the [skills.sh](https://www.skills.sh) marketplace, install/uninstall from market/GitHub/zip, and share installed skills via short links. A **pnpm-workspace monorepo** with two parts:

- **`apps/desktop`** — Electron desktop client (React 18 + TypeScript + Vite + better-sqlite3). This is what's open-sourced here.
- **`packages/types`** — `@skillkit/types`: cross-process shared types & constants (single source of truth).

The **server** (share short-link API + web 个人中心, Next.js 16) used to live here as `apps/server` but has **moved to a separate repo** at `../skillkit.net` (the product 官网 + backend). The desktop client talks to it over HTTPS at `https://skillkit.net` (share endpoints) and `https://account.skillkit.net` (auth). `packages/types` is mirrored (vendored) into that repo so the wire contract stays in sync — **when you change share/auth types or the tool list here, update the vendored copy in `skillkit.net/lib/shared-types.ts` too**.

## Commands

Run from the repo root.

```bash
pnpm install                 # workspace install (links @skillkit/types, installs apps/desktop deps)

# Desktop (apps/desktop)
pnpm --filter desktop rebuild   # REQUIRED: rebuilds better-sqlite3 against Electron's ABI. Run after install / Electron bumps.
pnpm --filter desktop dev       # Full Electron app in dev (vite-plugin-electron launches Electron + watches all 3 bundles)
pnpm --filter desktop build     # tsc -p both tsconfigs (typecheck, noEmit) + vite build
pnpm --filter desktop pack      # build + electron-builder --dir (unpacked, for debugging)
pnpm --filter desktop dist      # build + electron-builder → release/ (mac dmg/zip, win nsis)

# Repo-wide (turbo)
pnpm dev        # turbo dev — runs desktop dev
pnpm build      # turbo build
pnpm typecheck  # turbo typecheck
```

There is **no test framework**. Typechecking: desktop via its `typecheck` script (`tsc -p` both tsconfigs).

## Architecture

### Monorepo layout

```
apps/desktop/   electron/ src/ shared/ build/ public/ vite.config.ts tsconfig*.json
packages/types/ src/index.ts            # @skillkit/types
pnpm-workspace.yaml  turbo.json  package.json (root: devDeps + turbo scripts only)
```

### `packages/types` (`@skillkit/types`)

Symbols consumed by the desktop (and, via a vendored mirror, by the server in `../skillkit.net`): `Tool`, `TOOL_LABELS`, `ALL_TOOLS`, `InstalledSkill`, `MarketSkill`, `InstallResult`, `InstalledFilter`, `Market*`, `ShareMeta`, `ShareCreateResult`, `ShareSourceInfo`, and share constants (`SHARE_BASE_URL`, `SHARE_TTL_MS`, `SHARE_MAX_BYTES`). **Single source of truth** — this is the canonical copy.

It is **pure TS with no build step**. The desktop bundler is taught to compile it:
- **desktop** (`apps/desktop/vite.config.ts`): `resolve.alias['@skillkit/types'] → ../../packages/types/src` in **all three** vite bundles (renderer / electron main / preload).

> The server repo (`../skillkit.net`) keeps a vendored copy at `lib/shared-types.ts` (exposed via a local `@skillkit/types` tsconfig path alias) — it is **not** a workspace consumer. Keep the two in sync on share / auth / tool-list changes.

### Desktop: three-process Electron model

`apps/desktop/electron/` (main, ESM, → `dist-electron/`), `apps/desktop/electron/preload.ts` (→ `preload.mjs`), `apps/desktop/src/` (React renderer, → `dist/`).

- **`shared/types.ts` is now a bridge layer** (NOT the source of truth): it re-exports the cross-end symbols from `@skillkit/types` **plus** defines desktop-only types (`UpdateAvailableInfo`, the `SkillkitApi` IPC contract, the `Window` global). Main process imports it as `../shared/types.js`; renderer as `@shared/types`. Keeping `shared/` inside `apps/desktop/` means **both paths stayed identical after the monorepo move** — no import rewrites were needed.
- **Adding a main-process capability still needs three coordinated edits**: an IPC handler in `electron/ipc.ts`, a method on `window.skillkit` in `electron/preload.ts`, **and** the matching signature in `shared/types.ts` (`SkillkitApi`).
- The `@shared` alias → `shared/` is wired in `apps/desktop/vite.config.ts` (renderer + main) and both `apps/desktop/tsconfig*.json`. Both use `moduleResolution: bundler`, so `@skillkit/types` resolves via the workspace symlink + its `exports` field — no tsconfig `paths` needed for it.
- **Renderer 有三个别名**：`@shared`(shared)、`@skillkit/types`(跨端类型)，外加 shadcn 约定的 `@/`(→ `apps/desktop/src`)，同样在 `vite.config.ts` + `tsconfig.json` 配好。
- **CSS 三层 + shadcn 控件边界**：`src/styles/theme.css` 是品牌层(配色变量/暖色主题/原生组件视觉，**冻结新增**)；`src/styles/globals.css` 是桥接层(只放 shadcn token → theme.css 变量映射 + `@layer base` 兜底 + Tailwind v4 import，**故意跳过 preflight** 保护现有原生 CSS)；`src/components/ui/*` 是控件层(只装 `shadcn add` 产物)。判定准则：**控件交互用 shadcn，布局/品牌视觉用原生 CSS**。Tailwind v4 仅在 renderer bundle 生效。CSS 分层规则详见 `apps/desktop/STYLES.md`；**视觉设计语言与配色 token**（浅色 = Codex 中性近白、深色 = 暖棕品牌；点缀橙策略、反模式、改动约束）见 `apps/desktop/DESIGN.md`，改配色前先读它。

### ESM `.js` import gotcha

The project is `"type": "module"`. Files under `apps/desktop/electron/` import each other with explicit `.js` extensions (`from './db.js'` resolves to `db.ts`) because tsc/vite emit ESM. **Always use `.js` in local relative imports there**; omitting it breaks the built output.

### Desktop main-process modules (`apps/desktop/electron/`)

- **`db.ts`** — better-sqlite3, WAL. Tables: `installed_skills`, `market_skills`, `meta` (KV). One-time legacy migration copies the DB from the old `skillzix` userData dir to `skillkit`.
- **`tools.ts`** — `TOOLS` config: each tool's `roots[]`, `installRoot`, optional `builtinRoot`. Cursor scans two roots (`skills` + `skills-cursor`); Trae marks `~/.trae/builtin_skills` as builtin (not uninstallable).
- **`scan.ts`** — `scanAll()` scans every tool's roots and **clears + rewrites the entire `installed_skills` table**. **The filesystem is the source of truth; the DB is a cache.** Any installed-skill state you add must be reconstructable by a scan, or it will be wiped. IPC handlers call `scanAll()` after any install/uninstall/copy.
- **`installer.ts`** — market/GitHub installs fetch `codeload.github.com/<owner>/<repo>/tar.gz/HEAD`, extract via `tar`, locate the skill subdir; zip installs use `adm-zip` and find the shallowest dir containing `SKILL.md`. Existing installs are backed up then overwritten, rolling back on failure. Multi-target installs are independent.
- **`market.ts`** — pulls `skills.sh` sitemap XML, lazy-scrapes card descriptions from detail-page JSON-LD (`SoftwareApplication`), cached in SQLite with a **24h TTL**. `OFFICIAL_OWNERS = {anthropics, vercel-labs, microsoft}`.
- **`skill-md.ts`** — dependency-free YAML frontmatter parser; reads `SKILL.md` **or** `AGENTS.md`.
- **`share.ts`** — client side of sharing: zip an installed skill, POST to the server, inspect/install from a share link. Calls `${SHARE_BASE_URL}/share`, `/share/:id/meta`, `/share/:id/zip` (no `/api` prefix). The server is the private `../skillkit.net` repo.
- **`account.ts`** — desktop account auth: `ACCOUNT_BASE_URL` (packaged → `https://account.skillkit.net`, dev → `http://localhost:3000`) → `/api/auth/token` (login → bearer JWT) + `/api/me`. Token stored via Electron `safeStorage`; also attached to share uploads for attribution.
- **`updater.ts`** — electron-updater: background check, pushes "update available" to the renderer.

### Share / auth contract (with the private server)

The desktop ↔ server wire contract is defined by `packages/types` (share protocol: `ShareMeta` / `ShareCreateResult` / `ShareSourceInfo` / `SHARE_*`; auth: `PublicUser` / `TokenAuthResponse` / `AuthSession` / `SESSION_*`). Public share paths **MUST stay stable** — the desktop hardcodes them and existing short links depend on them: `POST /share`, `GET /share/[id]` (HTML receiver), `GET /share/[id]/meta` (JSON), `GET /share/[id]/zip` (download). The server repo is `../skillkit.net`; see its own `CLAUDE.md` / `DEPLOY.md` for server internals, Prisma schema, auth, and deploy.

### CI

`.github/workflows/build.yml` packages the desktop app (mac arm64, win x64) on push to main (path-ignores `docs/**`, `.claude/**`, `*.md`). Uses **pnpm** (`pnpm/action-setup` + `actions/setup-node` cache: pnpm), installs at repo root, then `pnpm run rebuild`/`build`/`electron-builder` with `working-directory: apps/desktop`. `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` (signing off; see the yml comments to enable). Release via `workflow_dispatch` + `softprops/action-gh-release`; `electron-updater` publishes to `github:robotbird/skillkit`.

### Data locations

- App DB: `~/Library/Application Support/skillkit/skillkit.db`
- Installed skills: each tool's user-level dir under `~` (`~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.trae/skills`, …)
