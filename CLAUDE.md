# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Skillkit v2 — a macOS Electron desktop app for managing "skills" across four AI coding tools (Claude Code, Codex, Cursor, Trae). It browses the [skills.sh](https://www.skills.sh) marketplace, installs/uninstalls skills from market/GitHub/zip, and shares installed skills via short links. Tech stack: **React 18 + TypeScript + Vite + Electron + better-sqlite3**. A separate **Hono** share server lives in `server/`.

## Commands

```bash
npm install
npm run rebuild   # REQUIRED: rebuilds better-sqlite3 against Electron's ABI (electron-rebuild). Run after install / Electron version bumps.
npm run dev       # Full Electron app in dev (vite-plugin-electron launches Electron + watches all 3 bundles)
npm run server    # Share server only (tsx, port 8787). Standalone package in server/ — run `npm install` there first.
npm run dev:all   # `npm run dev` + `npm run server` together via concurrently
npm run build     # tsc -p both tsconfigs (typecheck, noEmit) + vite build
npm run dist      # build + electron-builder → release/ (mac dmg + zip)
npm run pack      # build + electron-builder --dir (unpacked, for debugging)
```

There is **no test framework** in this repo (no test files, no test script). Typechecking for the main app is `npm run build` (it runs `tsc -p tsconfig.json` and `tsc -p tsconfig.node.json`); for the server, `cd server && npm run typecheck`.

## Architecture

### Three-process Electron model + shared types

- **Main process** (`electron/`, ESM, built to `dist-electron/`): all native/IO work — SQLite, filesystem scanning, tarball/zip extraction, network fetches, talking to the share server.
- **Preload** (`electron/preload.ts` → `preload.mjs`): exposes a single `window.skillkit` object via `contextBridge`. `contextIsolation: true`, `nodeIntegration: false` — the renderer can **only** reach the main process through this typed API.
- **Renderer** (`src/`, React, built to `dist/`): three views (`MySkillsView` / `MarketView` / `InstallView`) behind a `TopBar`, warm-dark theme in `src/styles/theme.css`.

**Adding any main-process capability requires three coordinated edits**: an IPC handler in `electron/ipc.ts`, a method on `window.skillkit` in `electron/preload.ts`, **and** the matching signature in `shared/types.ts` (`SkillkitApi`). `shared/types.ts` is the single source of truth for the cross-process contract — `Tool`, all data interfaces, the `SkillkitApi` type, and share constants (`SHARE_BASE_URL`, `SHARE_TTL_MS`, `SHARE_MAX_BYTES`).

The `@shared` alias → `shared/` is wired in **three** places: `vite.config.ts` (renderer and electron-main vite configs) and both tsconfigs (`tsconfig.json` renderer, `tsconfig.node.json` electron). The share server does **not** use the alias — it imports `../../shared/types.js` relatively (its own `server/tsconfig.json` has no `paths`).

### ESM `.js` import gotcha

The project is `"type": "module"`. TypeScript files in `electron/` and `server/` import each other with explicit `.js` extensions (e.g. `from './db.js'` resolves to `db.ts`) because tsc/vite emit ESM. **Always use `.js` in local relative imports** under these dirs; omitting it breaks the built output.

### Main-process modules (`electron/`)

- **`db.ts`** — better-sqlite3, WAL mode. Tables: `installed_skills`, `market_skills`, `meta` (KV). Includes a one-time legacy migration that copies the DB from the old `skillzix` userData dir to `skillkit` (Electron's userData dir follows `package.json#name`).
- **`tools.ts`** — `TOOLS` config: each tool's `roots[]` (scan locations), `installRoot`, and optional `builtinRoot`. Cursor scans two roots (`skills` + `skills-cursor`); Trae marks `~/.trae/builtin_skills` as builtin (not uninstallable).
- **`scan.ts`** — `scanAll()` scans every tool's roots and **clears + rewrites the entire `installed_skills` table**. **The filesystem is the source of truth; the DB is a cache.** Any installed-skill state you add must be reconstructable by a scan, or it will be wiped. IPC handlers call `scanAll()` after any install/uninstall/copy.
- **`installer.ts`** — market/GitHub installs fetch `codeload.github.com/<owner>/<repo>/tar.gz/HEAD`, extract via `tar`, locate the skill subdir; zip installs use `adm-zip` and find the shallowest dir containing `SKILL.md`. Existing installs are backed up then overwritten, rolling back on failure. Multi-target installs are independent (one failing target doesn't abort others).
- **`market.ts`** — pulls `skills.sh` sitemap XML, lazy-scrapes card descriptions from detail-page JSON-LD (`SoftwareApplication`), cached in SQLite with a **24h TTL**. `OFFICIAL_OWNERS = {anthropics, vercel-labs, microsoft}`.
- **`skill-md.ts`** — dependency-free YAML frontmatter parser; reads `SKILL.md` **or** `AGENTS.md`.
- **`share.ts`** — client side of the share feature: zip an installed skill, POST to the share server, inspect/install from a share link.

### Share server (`server/` + `api/`)

A Hono app that runs in **two modes off one codebase**, switched by entry file (not runtime branching):

- `api/lib/app.ts` — side-effect-free Hono `app` (`.basePath('/api')`), all routes, storage via `getStore()`. Lives inside `/api` so `@vercel/node` compiles it (TS outside `/api` is never compiled — see the deploy note below for why this matters). Importing it must NOT trigger `serve()`/`setInterval`/CLI/`ensureDir`. Sibling `store.ts`, `store-blob.ts`, `types.ts` share this constraint.
- `server/src/index.ts` — Aliyun/local entry: `@hono/node-server` `serve()` + hourly `setInterval` sweep + `--delete <id>` CLI. Default `HOST=0.0.0.0`. Imports `app`/`getStore` from `../../api/lib/` (shares the same source as the Vercel function).
- `api/[[...route]].ts` (repo root) — Vercel entry: `export const fetch = (req: Request) => app.fetch(req)` (Web-standard named export), importing `app` from `./lib/app.js`. **Do not** use `export default handle(app)` from `hono/vercel`: current `@vercel/node` treats a `default` export as Node-style `(req, res) => void` and ignores the returned `Response` (the function runs but the client gets a 404/empty response; the build warns "default export returned a `Response`"). The named `fetch` export is recognized as the Web API. The `[[...route]]` optional catch-all routes **all** `/api/*` to one function — **do not add a catch-all rewrite for `/api/*`** (it would collapse nested paths and break `c.req.param('id')`).

The Hono app, storage layer, and shared types live in **`api/lib/`** (`app.ts`, `store.ts`, `store-blob.ts`, `types.ts`) — the single source shared by both the Vercel function and the Aliyun `server/src/index.ts` entry. Storage is pluggable behind a `ShareStore` interface (`api/lib/store.ts`), selected by `SHARE_STORE` env: `local` (filesystem in `server/data/`, default) or `blob` (`api/lib/store-blob.ts`, Vercel Blob private). `getStore()` loads BlobStore via **dynamic import**, so Aliyun never needs `@vercel/blob`. The interface is fully async. 6-char nanoid IDs, 7-day TTL, **4MB cap** (constants in `api/lib/types.ts` — the cap exists for Vercel's 4.5MB request-body limit; Pro does not raise it). `api/lib/types.ts` is a **deliberate subset copy** of `shared/types.ts` (only `Tool`, `ShareMeta`, `ShareCreateResult`, `SHARE_TTL_MS`, `SHARE_MAX_BYTES` — the symbols the function needs at runtime) because `shared/types.ts` is outside `/api` and `@vercel/node` won't compile it; if those symbols change in `shared/types.ts`, sync them here. Routes live under `/api`: `/api/share` (POST), `/api/share/:id/meta` (JSON metadata — note: not `.json`; Hono's router confuses overlapping `/share/:id` and `/share/:id.json`, so meta uses a distinct `/meta` segment), `/api/share/:id/zip`, `/api/share/:id` (HTML receiver — content is HTML-escaped, keep it). **Public share links are clean: `https://skillkit.net/share/<id>`** (e.g. `…/share/eweqj`) — a `vercel.json` rewrite maps `/share/:path*` → `/api/share/:path*`, and the app builds its URLs without the `/api` prefix. The desktop client (`electron/share.ts`) calls the API at `/api/share` (works on both Vercel and local since the app uses `basePath('/api')`) but overrides the displayed link to the clean `/share/<id>`. Sweep: Aliyun hourly interval; Vercel daily cron hitting `/api/sweep` (guarded by `CRON_SECRET` header). Expired shares already return 410 on read, so sweep is cost-only.

Vercel deploy: Root Directory = **repo root**. `vercel.json` sets `framework:null` (no static frontend), `installCommand` with `--omit=dev --ignore-scripts` to skip the Electron binary download and better-sqlite3 native compile (neither is used by the function), `outputDirectory: "."` (without it Vercel errors "No Output Directory named dist"), a **no-op `buildCommand`** (see below), and the `api/[[...route]].ts` function with `maxDuration: 60`. **No `includeFiles`.** **The function MUST live under `/api`** — do not try the legacy `builds`/`routes` model to host it from `server/`. Current Vercel ignores `builds` for files outside `/api`, so such a deploy "succeeds" with zero functions and **every** path returns a Vercel `NOT_FOUND` 404 (this is what took the share endpoint down). The hard constraint: **`@vercel/node` only compiles TS *inside `/api`*** (and the `server/src/index.ts` Aliyun entry, which Vercel never builds). It compiles all of `/api` (including `lib/**`) and nft traces the import graph automatically — this happens **independently of the project `buildCommand`**, which is why the buildCommand must be a no-op: the repo's `build` script is `tsc -p … && vite build`, but `tsc`/`vite` are devDeps and `--omit=dev` means they're absent, so any buildCommand that runs `npm run build` dies with `tsc: command not found` (exit 127) before the function is ever compiled. Despite `framework:null`, Vercel still runs the package `build` script unless overridden — so `buildCommand` is set to a short `echo` no-op. (If a dashboard "Build Command" override is set to `npm run build`, it wins over `vercel.json` — clear it.) So any TS the function imports *must* live physically inside `/api` — which is why the app/store/types live in `api/lib/`. `includeFiles` would copy files verbatim without compiling `.ts`→`.js`, so don't use it. `api/tsconfig.json` (NodeNext) lets `@vercel/node`'s typecheck resolve the `.js` import specs to their `.ts` sources (a `.js` import only rewrites to `.ts` under NodeNext/Bundler, not default `moduleResolution: node`); the root `tsconfig.json` is excluded by `.vercelignore` so the nearest-tsconfig walk-up hits `api/tsconfig.json`. `.vercelignore` excludes desktop-only dirs (`electron/`, `src/`, `build/`, etc.) — **root-file patterns must be anchored with a leading `/`** (e.g. `/tsconfig.json`), since unanchored `tsconfig.json` matches at any depth and would also drop `server/tsconfig.json`. Env: `SHARE_STORE=blob`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`. Client `SHARE_BASE_URL` defaults to `https://skillkit.net` (override locally with `SKILLKIT_SHARE_BASE_URL`).

### Data locations

- App DB: `~/Library/Application Support/skillkit/skillkit.db`
- Installed skills: each tool's user-level dir under `~` (e.g. `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.trae/skills`).
