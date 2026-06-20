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

A Hono app that runs in **two modes off one codebase**, switched by entry file + env (not runtime branching):

- `server/src/app.ts` — side-effect-free Hono `app` (`.basePath('/api')`), all routes, storage via `getStore()`. Importing it must NOT trigger `serve()`/`setInterval`/CLI/`ensureDir` (the Vercel function bundles it).
- `server/src/index.ts` — Aliyun/local entry: `@hono/node-server` `serve()` + hourly `setInterval` sweep + `--delete <id>` CLI. Default `HOST=0.0.0.0`.
- `api/[[...route]].ts` (repo root) — Vercel entry: `export default handle(app)` via `hono/vercel`. The `[[...route]]` optional catch-all routes **all** `/api/*` to one function — **do not add a catch-all rewrite** (it would collapse nested paths and break `c.req.param('id')`).

Storage is pluggable behind a `ShareStore` interface (`server/src/store.ts`), selected by `SHARE_STORE` env: `local` (filesystem in `server/data/`, default) or `blob` (`server/src/store-blob.ts`, Vercel Blob private). `getStore()` loads BlobStore via **dynamic import**, so Aliyun never needs `@vercel/blob`. The interface is fully async. 6-char nanoid IDs, 7-day TTL, **4MB cap** (constants in `shared/types.ts` — the cap exists for Vercel's 4.5MB request-body limit; Pro does not raise it). Routes live under `/api`: `/api/share` (POST), `/api/share/:id/meta` (JSON metadata — note: not `.json`; Hono's router confuses overlapping `/share/:id` and `/share/:id.json`, so meta uses a distinct `/meta` segment), `/api/share/:id/zip`, `/api/share/:id` (HTML receiver — content is HTML-escaped, keep it). Sweep: Aliyun hourly interval; Vercel daily cron hitting `/api/sweep` (guarded by `CRON_SECRET` header). Expired shares already return 410 on read, so sweep is cost-only.

Vercel deploy: Root Directory = **repo root** (so the `shared/` sibling gets bundled; rooting at `server/` drops it and breaks the `../../shared/types.js` import). `vercel.json` sets `framework:null`, an `installCommand` with `--omit=dev --ignore-scripts` to skip the Electron binary download and better-sqlite3 native compile (neither is used by the function), `outputDirectory: "."` (this is API-only — no static frontend; without it Vercel errors "No Output Directory named dist"), and the function entry uses `includeFiles: "{server/src,shared}/**/*.js"` (a single glob string — Vercel's schema rejects an array here). **The Vercel Node.js runtime only compiles TS inside `/api` (and a `server` entrypoint); `server/src/` and `shared/` are outside `/api`, so `includeFiles` copies them verbatim — it does NOT compile `.ts` to `.js`.** Therefore `buildCommand` must compile them first: `vercel.json` sets `buildCommand: "bash vercel-build.sh"` (kept short — Vercel rejects `buildCommand` longer than 256 chars, so the real logic lives in `vercel-build.sh` at repo root, **not** under `scripts/` which `.vercelignore` excludes). The script installs `typescript` + `@types/node` into an isolated `/tmp/tsc-deps` prefix (kept out of the project so `--omit=dev` doesn't prune them — npm prunes explicitly-named packages that are listed as devDependencies), symlinks `@types/node` into `node_modules/@types` so the project `tsconfig` resolves node types, then runs `tsc -p server/tsconfig.vercel.json` which emits `.js` in place (`server/src/*.js`, `shared/types.js`; gitignored — build artifacts only). `includeFiles` then ships those `.js`; nft also traces them now that they exist. Without this, the function throws `ERR_MODULE_NOT_FOUND: Cannot find module '.../server/src/app.js'` (the import in `api/[[...route]].ts` is `../server/src/app.js`, and only `.ts` was being shipped). `.vercelignore` excludes desktop-only dirs — **root-file patterns must be anchored with a leading `/`** (e.g. `/tsconfig.json`), since unanchored `tsconfig.json` matches at any depth and would also drop `server/tsconfig.json`, which `server/tsconfig.vercel.json` extends (build then fails `TS5083: Cannot read file '.../server/tsconfig.json'`). Because the root `tsconfig.json` is excluded, `@vercel/node`'s own typecheck of `api/[[...route]].ts` would otherwise fall back to default `moduleResolution: node`, which does NOT rewrite a `.js` import spec to its `.ts` source — so `import { app } from '../server/src/app.js'` fails `TS2307: Cannot find module`. `api/tsconfig.json` (NodeNext) exists so `@vercel/node` picks it up by nearest-tsconfig walk-up and resolves the `.js`→`.ts` rewrite; this also pulls the whole `server/src` import chain into the typecheck, which surfaced 2 latent `Buffer`↔`Uint8Array<ArrayBuffer>` generic errors in `server/src/store.ts` (TS 5.7+; `npm run build` never typechecks `server/`, only `electron`+`src`) — fixed with `as Uint8Array` casts (type-only; runtime `Buffer` already is a `Uint8Array`). Env: `SHARE_STORE=blob`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`. Client `SHARE_BASE_URL` defaults to `https://skillkit.net` (override locally with `SKILLKIT_SHARE_BASE_URL`).

### Data locations

- App DB: `~/Library/Application Support/skillkit/skillkit.db`
- Installed skills: each tool's user-level dir under `~` (e.g. `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.trae/skills`).
