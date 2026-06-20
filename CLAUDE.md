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

Standalone npm package (own `package.json`, own `node_modules`). Hono app storing each share as `<id>.json` (metadata) + `<id>.zip` in `server/data/` (gitignored except README). 6-char nanoid IDs, 7-day TTL (swept hourly + on startup), 20MB cap (constants shared from `shared/types.ts`). Serves a receiver HTML page at `/share/:id` (content is HTML-escaped — keep it that way). Default `SHARE_BASE_URL` points at the cloud host; override locally with `SKILLKIT_SHARE_BASE_URL=http://127.0.0.1:8787`.

### Data locations

- App DB: `~/Library/Application Support/skillkit/skillkit.db`
- Installed skills: each tool's user-level dir under `~` (e.g. `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.trae/skills`).
