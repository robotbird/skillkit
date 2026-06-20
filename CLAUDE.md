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

### Share server (`server/`)

A Hono app that runs in **two modes off one codebase**, switched at runtime by `process.env.VERCEL` inside the single entry `server/src/index.ts`. **All share logic lives in `server/src/` and is self-contained** — it does NOT import from `shared/` or `api/` (those are gone). The desktop client (`electron/share.ts`) talks to it over HTTP.

- `server/src/app.ts` — side-effect-free Hono `app` (**no `basePath`**), all routes, storage via `getStore()`. Importing it must NOT trigger `serve()`/`setInterval`/CLI/`ensureDir`. Sibling `store.ts`, `store-blob.ts`, `types.ts` share this constraint.
- `server/src/index.ts` — the **only** entry, dual-mode: in Vercel (`process.env.VERCEL`) it does nothing at module top-level and `export default handle(app)` (via `hono/vercel`) is the function; otherwise it's the Aliyun/local entry with `@hono/node-server` `serve()` + hourly `setInterval` sweep + `--delete <id>` CLI. Default `HOST=0.0.0.0`.
- `server/src/types.ts` — **deliberate subset copy** of `shared/types.ts` (only `Tool`, `ShareMeta`, `ShareCreateResult`, `SHARE_TTL_MS`, `SHARE_MAX_BYTES` — the symbols the server needs at runtime). `shared/types.ts` is the desktop contract and lives outside `server/`; if those symbols change there, sync them here.

Storage is pluggable behind a `ShareStore` interface (`server/src/store.ts`), selected by `SHARE_STORE` env: `local` (filesystem in `server/data/`, default) or `blob` (`server/src/store-blob.ts`, Vercel Blob private). `getStore()` loads BlobStore via **dynamic import**, so Aliyun never needs `@vercel/blob`. The interface is fully async. 6-char nanoid IDs, 7-day TTL, **4MB cap** (constants in `server/src/types.ts` — the cap exists for Vercel's 4.5MB request-body limit; Pro does not raise it). Routes live at root (no `/api` prefix): `/share` (POST), `/share/:id/meta` (JSON metadata — note: not `.json`; Hono's router confuses overlapping `/share/:id` and `/share/:id.json`, so meta uses a distinct `/meta` segment), `/share/:id/zip`, `/share/:id` (HTML receiver — content is HTML-escaped, keep it), `/` (health), `/sweep` (cron). Full share URL is `https://skillkit.net/share/<id>` (e.g. `…/share/eweqj`). Sweep: Aliyun hourly interval; Vercel daily cron hitting `/sweep` (guarded by `CRON_SECRET` header). Expired shares already return 410 on read, so sweep is cost-only.

Vercel deploy: Root Directory = **repo root**. `vercel.json` uses the **legacy `builds` + `routes`** model (NOT the modern `api/[[...route]]` + `functions`/`rewrites`): `builds` declares `server/src/index.ts` as the `@vercel/node` function (`maxDuration: 60`), and `routes` catch-all `{ "src": "/(.*)", "dest": "/server/src/index.ts" }` routes **every** path to that one function while preserving the original URL (the function sees `/share/eweqj`, not the file path). `installCommand` uses `--omit=dev --ignore-scripts` to skip the Electron binary download and better-sqlite3 native compile (neither is used by the function). **Why legacy `builds`, not the modern `/api` function:** `@vercel/node` only *compiles* TS inside the function's own tree; a `/api` function importing TS from `server/` (outside `/api`) ships a runtime `import './app.js'` that never resolves → `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/server/src/app.js'` (this exact error burned ~8 commits when the impl lived in `api/lib/` and the entry reached across dirs). Making `server/src/index.ts` the function entry keeps every imported TS (`app.ts`/`store.ts`/…) in the same tree, so `@vercel/node` compiles them all — no cross-dir import, no `includeFiles`, no `buildCommand` (which would also fail: `--omit=dev` means `tsc`/`tsx` aren't installed). `routes`/`builds` is the only supported way to host a function outside `/api`. `server/tsconfig.json` (NodeNext) lets `@vercel/node`'s typecheck resolve the `.js` import specs to their `.ts` sources. `.vercelignore` excludes desktop-only dirs (`electron/`, `src/`, `shared/`, `build/`, etc.) plus `server/data/` and `server/node_modules/` — **root-file patterns must be anchored with a leading `/`** (e.g. `/tsconfig.json`), since unanchored `tsconfig.json` matches at any depth and would also drop `server/tsconfig.json`. Env: `SHARE_STORE=blob`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`. Client `SHARE_BASE_URL` defaults to `https://skillkit.net` (override locally with `SKILLKIT_SHARE_BASE_URL`).

### Data locations

- App DB: `~/Library/Application Support/skillkit/skillkit.db`
- Installed skills: each tool's user-level dir under `~` (e.g. `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.trae/skills`).
