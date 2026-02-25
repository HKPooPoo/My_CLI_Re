# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow (MANDATORY)

**Every task must be wrapped in two commits — one BEFORE changes and one AFTER.**

1. **Before starting work:** Stage and commit all current uncommitted changes with message `WIP: before <short task description>`
2. **After completing work:** Stage and commit all changes with a descriptive message summarising what was done
3. Do NOT push to remote — this repo is local-only
4. Keep commits atomic: one task = one before/after commit pair

## Project Overview

**My CLI Re** (My Clean Logging Interface) is a versioned communication platform with a unified Board model across three visibility scopes — personal (Blackboard), paired (Walkie-Typie), and public (Broadcast). Docker-based full-stack: Laravel 12 (PHP-FPM) backend + vanilla JS frontend served by Nginx, retro CRT terminal aesthetic.

## CRITICAL: Board Model & Operation Semantics

**This project uses VCS-inspired terminology but the operations do NOT match git semantics. Never assume git behavior.**

```
Board = timestamped text record (text + optional file attachments)
Blackboard  = Board(scope: SELF)    → personal, multi-branch timelines
Walkie-Typie = Board(scope: PAIR)   → P2P paired boards, real-time whisper
Broadcast    = Board(scope: PUBLIC) → public channels, one-to-many
```

| Term | MyCLI Meaning (NOT git) |
|------|------------------------|
| **Push** | Navigate toward NEWER records (decrement head index) |
| **Pull** | Navigate toward OLDER records (increment head index) |
| **Commit** | Upload ALL local records to server (full-branch replacement, Last-Write-Wins) |
| **Checkout** | Switch to a different branch, or download a server branch to local |
| **Fork** | Duplicate all records into a new independent branch (NO parent pointer, NO ancestry) |
| **Branch** | Independent flat timeline of text snapshots (NO tree, NO parent-child) |
| **HEAD** | In-memory integer offset into the record list (0 = newest) |
| **Drop** | Delete server-side records for a branch |
| **Clean** | Wipe all records in a branch, leaving one empty placeholder |

**What does NOT exist:** No tree/DAG, no parent pointers, no merge, no diff, no commit graph, no conflict resolution. Branches are flat sorted lists of timestamped records.

**Virtual State (BB only):** When user PUSHes past head 0, system enters "virtual" state — blank textarea with no backing record. Typing creates a new record and exits virtual mode.

**Storage:** Local-first, manual-sync. IndexedDB (primary) ←commit/checkout→ PostgreSQL (backup). Owner tag encodes sync state: `"local"` | `"local, online/{uid} [synced]"` | `"local, online/{uid} [asynced]"`.

**branch_id:** `Date.now()` — millisecond timestamp, NOT sequential. Branch name is a separate display label stored on every record.

## Development Commands

```bash
docker compose up -d --build          # Build and start all services
docker compose down                    # Stop all services
docker compose logs -f api             # Tail API logs
docker exec my-cli-api php artisan migrate
docker exec my-cli-api php artisan migrate:fresh --seed
docker exec my-cli-api php artisan test                        # Run all tests
docker exec my-cli-api php artisan test --filter TestClassName # Run single test
docker exec my-cli-api ./vendor/bin/pint                       # Lint (Laravel Pint)
# First-time setup:
docker exec my-cli-api sh -c "cp .env.example .env && php artisan key:generate && php artisan migrate --force"
```

| Service | URL |
|---------|-----|
| Frontend | `http://localhost` |
| API | `http://localhost/api` |
| PgAdmin | `http://localhost:8080` |
| Mailpit | `http://localhost:8025` |
| Reverb (WS) | `ws://localhost:8081` |
| PostgreSQL | `localhost:5431` |
| LibreTranslate | Docker-internal only (not host-exposed), started with `--profile mods` |

## Architecture

### Docker Services (11)

nginx (static SPA + reverse proxy) · api (Laravel 12 PHP-FPM) · reverb (WebSocket) · queue (`queue:listen`) · scheduler (cron) · db (PostgreSQL 16) · redis · pgadmin · mailpit · tunnel (Cloudflare) · libretranslate (optional, `profiles: [mods]`)

### Backend (`backend/`)

**Pattern:** Thin controllers validate input → call Service → return JSON. All logic in Services.

| Feature | Controller | Service |
|---------|-----------|---------|
| Blackboard | `BlackboardController` | `BlackboardService` |
| Walkie-Typie | `WalkieTypieController` | `WalkieTypieBoardService` |
| Broadcast | `BroadcastChannelController` | `BroadcastChannelService` |
| Files | `FileController` | `FileService` |
| Auth | `AuthController` | `AuthService` |
| Settings | `SettingsController` | `SettingsService` |
| Translation | `TranslationController` | — (in controller) |
| Speech | `SpeechController` | — (in controller) |
| Status | `StatusController` | — |
| MOD Health | `ModController` | — |

Models: `User`, `File` only. Events (4): `BroadcastChannelUpdated`, `WalkieTypieConnectionUpdated`, `WalkieTypieContentUpdated`, `WalkieTypieSignal`. Mail: `ResetPasscodeMail`, `BindEmailMail`. Commands: `CleanOrphanedFiles`.

**Rate limiting** (`routes/api.php`): AI endpoints 10/min · Writes/auth 30/min · Public reads 120/min · Auth commands 10/min · File reads 60/min

### Database Schema (10 migrations)

- **users** — uid (unique), passcode, title, email, settings (JSONB nullable)
- **blackboards** — user_id FK, branch_id (varchar), branch_name, timestamp (bigint ms), text, file_hash (text); UNIQUE(user_id, branch_id, timestamp)
- **walkie_typie_connections** — user_id FK, partner_id FK, partner_tag, my_branch_id, partner_branch_id, last_signal; UNIQUE(user_id, partner_id)
- **walkie_typie_boards** — user_id FK, branch_id, branch_name (nullable), timestamp (bigint ms), text, file_hash (text); UNIQUE(user_id, branch_id, timestamp)
- **broadcast_channels** — name (unique), user_id FK, last_signal (bigint ms)
- **broadcast_boards** — channel_id FK cascade, timestamp (bigint ms), text, file_hash (text); UNIQUE(channel_id, timestamp)
- **broadcast_pins** — user_id FK cascade, channel_id FK cascade; UNIQUE(user_id, channel_id)
- **files** — hash (unique), user_id FK, original_name, mime_type, size (bigint), disk_path, status (default 'staged')

`file_hash` migrated from varchar(512) to text for JSON array serialization. File status lifecycle: `staged` → `committed` → `orphaned` (cleaned after 24h).

### Frontend (`frontend/`)

Multi-section SPA — pure HTML, CSS, ES modules. No framework.

**Key directories:** `javascript/` (42 modules + `services/` 11 + `vendor/` 4) · `mods/` (manifest + loader + 3 templates) · `stylesheets/` (18 CSS files) · `locales/` (en.json, zh-TW.json, default.json) · `images/` (14 files) · `audio/` (10 MP3s)

**Architectural patterns:** Event-driven (`window.dispatchEvent`) · Hybrid storage (IndexedDB local + PostgreSQL via API) · Real-time via Laravel Echo/Reverb · Service layer abstracts all HTTP calls

**Legacy file:** `mod-registry.js` — v1 MOD registry remnant, exports `MOD_TYPES`. Not actively used by v2 system.

### Navigation System (`navi.js`)

Two-level hierarchy: main navi (`data-navi-item`: blackboard, walkie-typie, broadcast, mods) → sub-navi (`data-sub-navi-item`). State in `stateOfEachNaviItem[name]`.

- `updateNaviPosition()` — repositions sub-navi track via `translateX()`, highlights active, calls `updatePage()`, triggers CRT glitch, saves to localStorage
- `updatePage(subNaviItem)` — toggles `.active` on `.page` elements, controls push/pull buttons, head-indicator, feature scaffold based on CSS classes: `.can-push-pull`, `.show-branch`, `.have-feature`
- **Gotcha:** `updateNaviPosition()` always calls `updatePage()` which changes the visible page. Never call it from background data fetches unless the relevant section is active.
- Dispatches `navi:pageChanged` with `{ page }` on sub-navi change

### Custom Events

| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `auth:updated` | auth.js | — | Login/logout/register completed |
| `navi:pageChanged` | navi.js | `{ page }` | Sub-navigation changed |
| `list:selectionChanged` | blackboard-ui-list.js | `{ index, item }` | List cursor moved |
| `list:updated` | blackboard-ui.js | — | VCS/broadcast list data refreshed |
| `broadcast:selected` | broadcast-list.js | `ch` | Channel clicked |
| `broadcast:cleared` | broadcast-list.js, broadcast-channel.js | — | Channel deleted |
| `broadcast:channelRenamed` | broadcast-channel.js, broadcast-list.js | `{ channelId, newName }` | Channel renamed |
| `broadcast:signalUpdated` | broadcast-channel.js | `{ channelId }` | Board content updated |
| `blackboard:branchRename` | blackboard-ui.js | `{ branchId, newName }` | Branch name edited |
| `pwa:installable` | pwa.js | — | PWA install prompt available |
| `i18n:ready` | i18n.js | — | Locale loaded and DOM rendered |
| `settings:changed` | settings.js | `{ scope, key, value }` | Any setting changed |
| `walkie-typie:connection-update` | walkie-typie-core.js | `connection_data` | WS connection event received |
| `walkie-typie:content-update` | walkie-typie-core.js | `content_data` | WS content event received |
| `walkie-typie:disconnected` | walkie-typie-list.js | `{ partner_id }` | Partner disconnected |
| `walkie-typie:selected` | walkie-typie-list.js | `{ connection }` | Connection selected in list |
| `mods:loaded` | mod-loader.js | — | All templates loaded and init() called |
| `mods:instanceAdded` | mod-state.js | `{ instance }` | New instance created |
| `mods:instanceRemoved` | mod-state.js | `{ instanceId, templateId, instance }` | Instance deleted |
| `mods:configChanged` | mod-state.js | `{ instanceId, templateId, key, value }` | Instance config changed |
| `mods:reordered` | mod-state.js | `{ instanceId, direction }` | Instance order changed |
| `mods:selected` | mods-manager.js | `{ instanceId }` | Instance selected in list (500ms debounce) |
| `mods:buttonsRebuilt` | mod-loader.js | — | Instance buttons DOM rebuilt |

**Gotcha:** `list:selectionChanged` fires from ALL InfiniteList instances — listeners MUST check `container.contains(detail.item)` to filter.

### i18n System (`i18n.js`) — MANDATORY

**All user-facing strings MUST use the i18n system.** Never hardcode display text.

- **JS:** `t('section.key')` or `t('section.key', { var })` for interpolation
- **HTML:** `data-i18n="key"` for textContent, `data-i18n-placeholder="key"` for placeholder
- **New strings:** Add to BOTH `frontend/locales/en.json` AND `frontend/locales/zh-TW.json`
- Locale stored in `localStorage['locale']`, defaults to `'default'` (which falls back to en.json on fetch failure)
- `mergeStrings(partial)` deep-merges into global strings (used by mod-loader for MOD-local i18n)
- `renderDOM()` re-scans all `data-i18n*` elements — **do NOT** put `data-i18n` on elements managed by MultiStepButton (conflicts with armed-state label)

### MultiStepButton (`multiStepButton.js`)

- **INSTANT:** `new MultiStepButton(el, { action })` — single click fires
- **CONFIRM:** `new MultiStepButton(el, { action, confirm: true, confirmLabel })` — first click arms (`.btn-armed`), second fires, auto-resets after 3s
- Prevents double-fire via `aria-busy="true"` during async actions

### Toast & Messages

- `toast.addMessage(text, duration, type)` — creates animated toast, returns `{ update(text, duration), close() }`
- `BBMessage.info(text)` — prefixes "SYSTEM > ", `BBMessage.error(text)` — prefixes "CRITICAL > ", `BBMessage.success(text)` — prefixes "SYSTEM > "
- `BBMessage.requireLogin()` — standard login-required message

### CSS Architecture (`stylesheets/`)

**Theme:** CSS custom properties on `:root`. Dark (CRT) is default; `data-theme="light"` switches to light. Key vars: `--text-green`, `--text-orange`, `--text-red`, `--text-cyan`, `--text-yellow`, `--bg-primary`, `--bg-secondary`. Light mode disables all glow/shadow/scanlines.

**CRT effects** (`crt-vfx.css`): `.crt-scanner` scanlines, `.crt-noise-layer` + `.glitchEffect` animation on sub-navi change. Atomic color classes: `.crt-text-orange`, `.crt-text-green`, etc.

**Layout:** `--container-width: clamp(300px, 86vw, 512px)`, `--font-size: clamp(0.875rem, ...)`, fixed `--navi-height: 64px`, `--sub-navi-height: 48px`

### Real-Time (WebSocket)

`echo-service.js` — singleton Laravel Echo instance connecting to Reverb.

**Server events:**

| Event | `broadcastAs()` | Channel | Payload |
|-------|-----------------|---------|---------|
| `BroadcastChannelUpdated` | `broadcast.channel.updated` | Public `broadcast-channel.{id}` | `{ channel_id, name, owner_uid, last_signal, action }` |
| `WalkieTypieConnectionUpdated` | `walkie-typie.updated` | Private `App.Models.User.{uid}` | `{ connection_data }` |
| `WalkieTypieContentUpdated` | `walkie-typie.content` | Private `App.Models.User.{uid}` | `{ content_data: { text, branch_id, sender_uid } }` |
| `WalkieTypieSignal` | `walkie-typie.content` | Private `App.Models.User.{partnerUid}` | `{ content_data: { branch_id, sender_uid, timestamp, text: null } }` |

**Client whisper** (no server): `'typing'` on private `walkie-typie.{uid1}.{uid2}` (sorted), 50ms debounce.

**WT layers:** Whisper (50ms) → IndexedDB save (200ms) → Server commit (2s) + signal event → partner re-sync.

### PWA & Service Worker

- Stale-while-revalidate for static assets; `/api/` bypasses SW
- Update: `updatefound` → toast → `SKIP_WAITING` → silent takeover (no forced reload)
- **Always bump `CACHE_NAME` in `sw.js`** when modifying `index.html` or adding files

## MOD System v2.1 (Instance-Based, ADD/DELETE Model)

Self-contained plug-and-play features. **1 Instance = 1 Feature Button.** Templates are blueprints instantiated multiple times with independent config and order. 4th main nav section (`mods`) has list + config pages.

### CRITICAL: ADD/DELETE Model (NOT Toggle)

**Instance existence = enabled.** There is no ON/OFF toggle. To "disable" a MOD, delete the instance. To "enable", add a new one. The `enabled` field does NOT exist on instances.

Instance data model (persisted in `localStorage['mod-instances']`):
```js
{ instanceId: 'i_translate_1', templateId: 'translate', order: 0, config: { targetLang: 'zh-TW', provider: 'google' } }
```

### Boot Sequence

`i18n:ready` → `loadAllMods()` → validate templates → register in ModState → wire context factory → run migration (v1→v2→v3, legacy data only) → fetch MOD-local locales → create DOM (buttons from instances + shelves from templates) → register declarative hooks + tools → call `template.init(ctx)` → dispatch `mods:loaded`

**No auto-instantiation:** First boot starts with zero instances. Users add instances manually from the template catalog. `defaultInstances` in templates are used only by v2→v3 migration for legacy data.

### Architecture

- **`mod-manifest.js`** — static export list (single source of truth)
- **`mod-loader.js`** — imports, validates, registers, creates DOM, calls init(). Exports: `getTemplate()`, `getAllTemplates()`, `getInstances()`, `getInstancesByTemplate()`, `rebuildInstanceButtons()`, `updateInstanceButton()`, `removeInstanceButton()`
- **`mod-state.js`** — instance CRUD + template registry. `addInstance()` respects `maxInstances` cap. `removeInstance()` always allowed (no guard on maxInstances). Dispatches `mods:instanceAdded/Removed`, `mods:configChanged`, `mods:reordered`
- **`mod-context.js`** — `createModContext()` builds sandboxed API: `ctx.instance.*`, `ctx.board.*`, `ctx.ui.*`, `ctx.i18n.*`, `ctx.storage.*`, `ctx.net.*`, `ctx.file.*`, `ctx.events.*`, `ctx.hooks.*`, `ctx.query.*`. Read the file for full API reference.
- **`mod-board-provider.js`** — board data access (metadata providers, history, file cache)
- **`mod-field-registry.js`** — config field type registry. Built-in: `select`, `text`, `range`, `toggle`, `info`, `action`. Custom via `ctx.ui.registerFieldType()`
- **`mod-hooks.js`** — priority-ordered pipeline. API: `register/unregister/unregisterAll/run/has`. Hook points not yet instrumented (Phase C deferred).
- **`mod-tools.js`** — cross-MOD tool registry (OpenAI function-calling compatible). API: `register/unregisterAll/executeTool/getToolDefinitions/hasTool/getToolNames`
- **`mods-manager.js`** — list page (template catalog + active instances InfiniteList) + config page (fields from `configSchema`, instance management: UP/DOWN/DELETE)
- **`feature-shelf.js`** — feature button visibility per page (driven by `template.pages` keys), click → deactivate previous → build ModContext → `template.activate(ctx)`. Exports: `openShelf()`, `closeShelf()`

### Instance UI Positions (4)

| Position | What | Built by |
|----------|------|----------|
| List page | Item in active instances list | Framework |
| Config page | Config fields + UP/DOWN/DELETE | Framework |
| Feature button | Icon button in HUD bar | Framework (data-instance-id, CSS ::after icon) |
| Shelf panel | Content when button clicked | **Template** fills in `init()` (shared per template) |

### Current Templates (3)

| ID | Group | maxInstances | Defaults (migration only) | Providers | Tools |
|----|-------|-------------|--------------------------|-----------|-------|
| `translate` | linguistics | unlimited | 4 (zh-TW, zh-CN, en, ja) | google, libretranslate | `translate_text` |
| `speech-to-text` | linguistics | 1 | 1 | google-speech | — |
| `markdown-preview` | utilities | 1 | 1 | marked (client) | — |

### Adding a New Template

1. Copy `mods/_template/` → `mods/{id}/` (full skeleton with docs)
2. Edit `mod.js`: set `id`, `group`, `nameKey`, `descriptionKey`, `configSchema`, `defaultInstances`, `providers`
3. Set `pages` keys for button visibility (e.g. `{ 'blackboard-log': { textareaSelector: '#log-textarea' } }`)
4. Create `mods/{id}/locales/{en,zh-TW,default}.json`
5. Add `export { default as myMod } from './{id}/mod.js'` to `mod-manifest.js`
6. Add icon: CSS `.feature-btn[data-feature-btn="{btn-id}"]::after { mask-image: url(...) }` OR implement `getIconUrl(config)` in template
7. Implement `init(ctx)` and `activate(ctx)` using ModContext API
8. Optionally add `tools[]` and `hooks[]`
9. **Bump `CACHE_NAME` in `sw.js`**

## Platform Workarounds

### iOS WebKit (`writing-mode: sideways-lr` bug)
iOS renders `sideways-lr` CW instead of CCW. Fix in `page-blackboard-log.css`:
```css
@supports (-webkit-touch-callout: none) {
    .head-indicator { writing-mode: vertical-rl; scale: -1 -1; }
}
```
`navi.js` detects iOS and uses `translateX(+256%)` (instead of `-256%`) for the head-indicator hide direction. The feature scaffold uses `translateX(256%)` for both iOS and non-iOS.

### iOS detection
```javascript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```

### Mobile audio
`audio.js` skips playback on mobile (autoplay restrictions).

## Nginx Routing
- `/api/files` — upload streaming, request buffering disabled, 3600s timeout
- `/app` — proxied to Reverb WebSocket
- `/api/*` — PHP-FPM FastCGI
- All else — `index.html` (SPA fallback)

## Environment Variables

Required external keys (obtain from team lead):
- `GG_API` — Google Cloud API key (translation & speech)
- `CLOUDFLARED_TOKEN` — Cloudflare tunnel token
- `MAIL_*` — Standard Laravel mail credentials for password reset emails

These are set in root `.env` and injected via `docker-compose.yml`, NOT in `backend/.env.example`.

## Host Machine

Local dev & deployment: Intel i7-13th Gen · RTX 4080 · 64GB RAM · Windows 11 · Docker Desktop · Cloudflare Tunnel. Capable of running local AI models (Whisper, Llama 3 8B+). MOD provider architecture (`cloud`/`server`/`client`) leverages this.

## MCP Servers

```bash
# Context7 — real-time library documentation
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
# dbhub — direct PostgreSQL access
claude mcp add my-db -- npx -y @bytebase/dbhub --dsn "postgresql://yu:prejudice720917q@localhost:5431/my-cli-db"
```

## Custom Audit Agents (`.claude/agents/`)

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| **css-auditor** | CRT theme, flex layout, dark/light mode | After CSS changes |
| **i18n-checker** | Locale key parity, hardcoded strings | After adding UI text |
| **event-flow-tracer** | Race conditions, orphaned events | After changing event dispatch/listeners |
