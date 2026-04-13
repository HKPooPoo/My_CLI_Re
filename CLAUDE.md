# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow (MANDATORY)

**Every task must be wrapped in two commits — one BEFORE changes and one AFTER.**

1. **Before starting work:** Stage and commit all current uncommitted changes with message `WIP: before <short task description>`
2. **After completing work:** Stage and commit all changes with a descriptive message summarising what was done
3. Do NOT push to remote — this repo is local-only
4. Keep commits atomic: one task = one before/after commit pair

## Keeping CLAUDE.md Current (MANDATORY)

**This file must stay in sync with the codebase.** When an implementation changes documented behavior — new settings, new events, new layers, changed defaults, new templates, altered APIs — update the relevant sections of CLAUDE.md in the same commit. If you added it, document it. If you changed it, update the docs. Stale documentation is worse than no documentation.

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
| **Checkout** | Re-download the current HEAD branch from server (same branch selected) |
| **Switch** | Change to a different branch (different branch selected) |
| **Fork** | Duplicate all records into a new independent branch (NO parent pointer, NO ancestry) |
| **Branch** | Independent flat timeline of text snapshots (NO tree, NO parent-child) |
| **HEAD** | In-memory integer offset into the record list (0 = newest) |
| **Drop** | Delete server-side records for a branch |
| **Clean** | Wipe all records in a branch, leaving one empty placeholder |

**What does NOT exist:** No tree/DAG, no parent pointers, no merge, no diff, no commit graph, no conflict resolution. Branches are flat sorted lists of timestamped records.

**Virtual State (BB only):** When user PUSHes past head 0, system enters "virtual" state — blank textarea with no backing record. Typing creates a new record and exits virtual mode.

**Storage:** Local-first, manual-sync. IndexedDB (primary) ←commit/checkout→ PostgreSQL (backup). Owner tag encodes sync state: `"local"` | `"local, online/{uid} [synced]"` | `"local, online/{uid} [asynced]"`.

**branch_id:** `Date.now()` — millisecond timestamp, NOT sequential. Branch name is a separate display label stored on every record.

### Known Design Decisions

**LWW Commit (Last-Write-Wins):** Commit is full-branch replacement — client sends all records, server DELETEs records not in payload then UPSERTs the rest. No conflict detection, no optimistic locking. Accepted for personal notebook system: same-user dual-device simultaneous commit is near-impossible (auto-sync deviceId prevents self-echo). Diff-Match-Patch is not applicable — DMP solves intra-document text conflicts, not inter-record set conflicts. Timestamp-Based Union Merge was considered but rejected — `updateText()` uses delete + create (IndexedDB primary key includes timestamp, cannot update in place), so union merge would resurrect old record versions. Correct merge would require record lineage tracking, which exceeds the system's complexity budget.

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
npm run build:sw                       # Rebuild SW precache manifest after frontend changes
# First-time setup:
npm install                            # Install workbox-build (dev tooling)
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

## Testing

### CRITICAL: Docker SQLite Isolation

**Tests MUST use SQLite in-memory, NEVER production PostgreSQL.** Docker sets `DB_CONNECTION=pgsql` as an OS-level env var. PHPUnit's `phpunit.xml <env>` tags **cannot override OS-level env vars** even with `force="true"`. Without proper isolation, `RefreshDatabase` runs `migrate:fresh` which **drops all production tables**.

**How it works:** `TestCase::setUp()` calls `putenv('DB_CONNECTION=sqlite')` + `$_ENV` + `$_SERVER` overrides BEFORE `parent::setUp()` creates the Laravel app and runs migrations. This ensures `RefreshDatabase` targets SQLite in-memory, not PostgreSQL.

**Database-agnostic migrations:** Any migration using PostgreSQL-specific SQL (e.g. `ALTER TABLE ... ALTER COLUMN ... TYPE text`) MUST be guarded with `if (DB::getDriverName() === 'pgsql')`. SQLite stores all strings as TEXT natively, so column type changes are unnecessary there.

```bash
docker exec my-cli-api php artisan test                        # Run all tests (safe — uses SQLite)
docker exec my-cli-api php artisan test --filter TestClassName # Run single test class
```

### Test Suite (189 tests, 414 assertions)

| Test Class | Tests | What it covers |
|------------|-------|----------------|
| `AuthServiceTest` | 19 | register, login, /passwd, /bind, requestPasswordReset |
| `BlackboardServiceTest` | 19 | LWW commit, blank skip, dedup, cache, events, CRUD |
| `BlackboardControllerTest` | 31 | HTTP integration: commit validation, auth guards, response format, round-trip, LWW via HTTP |
| `BroadcastChannelServiceTest` | 19 | cast (DELETE+INSERT), rename, destroy, pin/unpin, title guard |
| `BroadcastChannelControllerTest` | 34 | HTTP integration: public index/fetchBoards, cast validation + title guard, rename/destroy ownership, pin/unpin, lifecycle |
| `WalkieTypieControllerTest` | 39 | HTTP integration: connection CRUD, signal, tag update, board commit/fetch, lifecycle round-trip |
| `WalkieTypieBoardServiceTest` | 12 | LWW commit, partner signal, connection access control |
| `FileServiceTest` | 14 | upload dedup, markCommitted, markOrphaned, cleanupOrphaned |

### Test Conventions

- Use `#[Test]` attribute (NOT `/** @test */` doc-comment — deprecated in PHPUnit 12)
- `Cache::flush()` in `setUp()` when service uses `Cache::remember()` (array cache persists across tests)
- Timestamp manipulation: set `$model->timestamps = false` before `save()` to prevent Eloquent auto-overriding `created_at`/`updated_at`
- Event assertions: `Event::fake([EventClass::class])` before calling service methods that broadcast
- File tests: `Storage::fake('local')` in setUp to avoid real disk writes

## Data Backup & Restore

Automated PostgreSQL backup via `pg_dump`, scheduled through Laravel's task scheduler. Backups stored in `backend/storage/backups/`. The `postgresql-client` package is installed in the PHP Docker image (`Dockerfile`).

```bash
# Manual backup (from host)
docker exec my-cli-api php artisan app:backup

# List existing backups
docker exec my-cli-api ls storage/backups/

# Restore (interactive confirmation)
docker exec -it my-cli-api php artisan app:backup --restore=backup_2026-03-11_163949.sql

# Restore (scripted, skip confirmation)
docker exec my-cli-api php artisan app:backup --restore=backup_2026-03-11_163949.sql --force
```

**Schedule:** Daily at 03:00 AM via `routes/console.php`. Auto-prunes to keep last 7 backups. Command: `DatabaseBackup` (`app/Console/Commands/DatabaseBackup.php`).

## Architecture

### Docker Services (11)

nginx (static SPA + reverse proxy) · api (Laravel 12 PHP-FPM) · reverb (WebSocket) · queue (`queue:listen`) · scheduler (cron) · db (PostgreSQL 16) · redis · pgadmin · mailpit · tunnel (Cloudflare) · ollama (Qwen3.5 LLM, GPU, auto-pull via entrypoint)

### Backend (`backend/`)

**Pattern:** Thin controllers validate input → call Service → return JSON. All logic in Services.

| Feature | Controller | Service |
|---------|-----------|---------|
| Blackboard | `BlackboardController` | `BlackboardService` |
| Walkie-Typie | `WalkieTypieController` | `WalkieTypieBoardService` |
| Broadcast | `BroadcastChannelController` | `BroadcastChannelService` |
| Files | `FileController` | `FileService` |
| Auth | `AuthController` | `AuthService` |
| Translation | `TranslationController` | — (in controller) |
| Speech | `SpeechController` | — (in controller) |
| Status | `StatusController` | — |
| LLM (MOD) | `LlmController` | — (in controller) |
| MOD Health | `ModController` | — |
Models: `User`, `File` only. Events (5): `BlackboardUpdated`, `BroadcastChannelUpdated`, `WalkieTypieConnectionUpdated`, `WalkieTypieContentUpdated`, `WalkieTypieSignal`. Mail: `ResetPasscodeMail`, `BindEmailMail`. Commands: `CleanOrphanedFiles`.

**Rate limiting** (`routes/api.php`): AI endpoints 10/min · Auth login/register 30/min · Auth commands 10/min. All other endpoints (reads, writes, files, mods) are unthrottled — local single-user app with Redis caching. Client-side 429 handling: `api.js` dispatches `api:rateLimited` event (5s debounce), `blackboard-msg.js` listens and shows toast.

### Database Schema (11 main tables)

**Main DB (PostgreSQL `my-cli-db`):**

- **users** — uid (unique), passcode, title, email, settings (JSONB nullable)
- **blackboards** — user_id FK, branch_id (varchar), branch_name, timestamp (bigint ms), text, file_hash (text); UNIQUE(user_id, branch_id, timestamp)
- **walkie_typie_connections** — user_id FK, partner_id FK, partner_tag, my_branch_id, partner_branch_id, last_signal; UNIQUE(user_id, partner_id)
- **walkie_typie_boards** — user_id FK, branch_id, branch_name (nullable), timestamp (bigint ms), text, file_hash (text); UNIQUE(user_id, branch_id, timestamp)
- **broadcast_channels** — name (unique), user_id FK, last_signal (bigint ms)
- **broadcast_boards** — channel_id FK cascade, timestamp (bigint ms), text, file_hash (text); UNIQUE(channel_id, timestamp)
- **broadcast_pins** — user_id FK cascade, channel_id FK cascade; UNIQUE(user_id, channel_id)
- **files** — hash (unique), user_id FK, original_name, mime_type, size (bigint), disk_path, status (default 'staged')

`file_hash` migrated from varchar(512) to text for JSON array serialization. File status lifecycle: `staged` → `committed` → `orphaned` (cleaned after 24h). Stale `staged` files (uploaded but never committed within 24h) are also marked `orphaned` by the hourly cron and cleaned in the next cycle. Performance indexes migration adds composite indexes for frequent query patterns.

### Frontend (`frontend/`)

Multi-section SPA — pure HTML, CSS, ES modules. No framework.

**Key directories:** `javascript/` (47 modules + `services/` 12 + `vendor/` 5) · `mods/` (mod-loader + 12 template folders) · `stylesheets/` (19 CSS files) · `locales/` (en.json, zh-TW.json, default.json) · `images/` (21 files) · `audio/` (10 MP3s)

**Architectural patterns:** Event-driven (`window.dispatchEvent`) · Hybrid storage (IndexedDB local + PostgreSQL via API) · Real-time via Laravel Echo/Reverb · Service layer abstracts all HTTP calls · Debounce lifecycle via `TimerGroup` (`timer-group.js`) — named timer scheduling with `cancel/cancelAll/flush`; used by BB, BC, WT for input debounce management

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
| `mods:sharedConfigChanged` | mod-state.js | `{ group, key, value }` | Group shared config changed |
| `mods:reordered` | mod-state.js | `{ instanceId, direction }` | Instance order changed |
| `mods:selected` | mods-manager.js | `{ instanceId }` | Instance selected in list (500ms debounce) |
| `mods:buttonsRebuilt` | mod-loader.js | — | Instance buttons DOM rebuilt |
| `screensaver:activated` | pressStart.js | `{ initial }` | Overlay shown (idle timeout or page load) |
| `screensaver:deactivated` | pressStart.js | — | Overlay dismissed by click |
| `llm:progress` | llm/_shared.js | `{ status, text?, model? }` | WebLLM model loading/ready/error |
| `theme:changed` | theme-engine.js | `{ themeId }` | Active theme MOD changed |
| `api:rateLimited` | api.js | — | 429 response received (5s debounce) |

**Gotcha:** `list:selectionChanged` fires from ALL InfiniteList instances — listeners MUST check `container.contains(detail.item)` to filter.

### i18n System (`i18n.js`) — MANDATORY

**All user-facing strings MUST use the i18n system.** Never hardcode display text.

- **JS:** `t('section.key')` or `t('section.key', { var })` for interpolation
- **HTML:** `data-i18n="key"` for textContent, `data-i18n-placeholder="key"` for placeholder
- **New strings:** Add to ALL THREE locale files: `en.json`, `default.json`, AND `zh-TW.json`
- Locale stored in `localStorage['locale']`, defaults to `'default'` (which falls back to en.json on fetch failure)

**Three locales, three voices:**

| File | Purpose | Terminology style |
|------|---------|-------------------|
| `default.json` | "GIT MODE" — VCS-inspired power user English (default locale) | PUSH/PULL/COMMIT/BRANCH |
| `en.json` | Friendly English — zero jargon, guides the user | Newer/Older/Upload/Topic |
| `zh-TW.json` | Natural Traditional Chinese — no translated manuals | 較新/較舊/上傳/主題 |

Code-level identifiers (`commit`, `checkout`, `push`, `pull`, `branch`) remain unchanged. Only **UI display text** varies per locale. When adding strings to `en.json` and `zh-TW.json`, never leak VCS terms — use the vocabulary mapping in the table above.
- `mergeStrings(partial)` deep-merges into global strings (used by mod-loader for MOD-local i18n)
- `renderDOM()` re-scans all `data-i18n*` elements — MultiStepButton is now i18n-aware: if an element has `data-i18n`, the button reads the translated label via `t()` and re-captures on `i18n:ready`. Static `data-i18n` on MultiStepButton elements is safe.

### MultiStepButton (`multiStepButton.js`)

- **INSTANT:** `new MultiStepButton(el, { action })` — single click fires
- **CONFIRM:** `new MultiStepButton(el, { action, confirm: true, confirmLabel })` — first click arms (`.btn-armed`), second fires, auto-resets after 3s
- Prevents double-fire via `aria-busy="true"` during async actions
- **Do NOT use for dynamic-label buttons.** Constructor captures `originalLabel` at init time — external `textContent` changes conflict. Use raw `addEventListener` instead (see Dynamic Buttons below). However, static `data-i18n` labels ARE supported: MultiStepButton detects `data-i18n` and uses `t()` for label restoration, with `i18n:ready` listener to re-capture after locale loads.

### Dynamic State Buttons (Blackboard)

Buttons that change label/behavior based on list selection context. Use raw `addEventListener` + module-level state variables (NOT MultiStepButton). Remove `data-i18n` from HTML — text is set purely by JS.

**Checkout/Switch** (`checkout-btn`): `updateCheckoutButtonState()` on `list:selectionChanged`
- `selected.id === state.branchId` → **CHECKOUT** (re-download from server, `targetOwner="remote"`)
- `selected.id !== state.branchId` → **SWITCH** (change branch, `targetOwner` based on `isLocal`)

**Clean/Drop/Delete** (`drop-btn`): `updateDropButtonState()` on `list:selectionChanged`
- `isLocal && hasContent` → **CLEAN** (wipe records, keep branch)
- `isServer` (no local content) → **DROP** (delete server copy)
- `isLocal && !hasContent && !isServer` → **DELETE** (remove empty branch)

### Toast & Messages

- `toast.addMessage(text, duration, type, loading)` — creates animated toast, returns `{ update(text, duration), close() }`
- `BBMessage.info(text)` — prefixes "SYSTEM > ", `BBMessage.error(text)` — prefixes "CRITICAL > ", `BBMessage.success(text)` — prefixes "SYSTEM > "
- `BBMessage.loading(text)` — prefixes "SYSTEM > ", sets `data-loading="true"` on toast element. `.update()` auto-removes `data-loading`. Use for async operations that show progress (auth, sync, fork, etc.)
- `BBMessage.requireLogin()` — standard login-required message
- **ModContext:** `ctx.ui.toast()`, `ctx.ui.toastError()`, `ctx.ui.toastSuccess()`, `ctx.ui.toastLoading()`

### CSS Architecture (`stylesheets/`)

**Theme:** CSS custom properties on `:root`. Dark (CRT) is default; `.theme-light` class on `<html>` switches to light. Key vars: `--text-green`, `--text-orange`, `--text-red`, `--text-cyan`, `--text-yellow`, `--bg-primary`, `--bg-secondary`. Light mode disables all glow/shadow/scanlines. Theme switching is handled by `theme-engine.js` + Light Theme MOD.

**CRT effects** (`crt-vfx.css`): `.crt-scanner` scanlines, `.crt-noise-layer` + `.glitchEffect` animation on sub-navi change. Atomic color classes: `.crt-text-orange`, `.crt-text-green`, etc.

**Layout:** `--container-width: clamp(300px, 86vw, 512px)`, `--font-size: clamp(0.875rem, ...)`, fixed `--navi-height: 64px`, `--sub-navi-height: 48px`

**Global flex-column default:** `style.css` lines 113-124 set all `body`, `nav`, `div`, `span`, `.header`, `.body`, `.footer` to `display: flex; flex-direction: column; position: relative`. This means every div/span defaults to vertical flex layout. `justify-content` acts on the vertical axis, `align-items` on horizontal. For horizontal layout, explicitly set `flex-direction: row`. All elements have `position: relative` by default.

### Real-Time (WebSocket)

`echo-service.js` — singleton Laravel Echo instance connecting to Reverb.

**Server events:**

| Event | `broadcastAs()` | Channel | Payload |
|-------|-----------------|---------|---------|
| `BlackboardUpdated` | `blackboard.updated` | Private `App.Models.User.{uid}` | `{ branch_id, device_id }` |
| `BroadcastChannelUpdated` | `broadcast.channel.updated` | Public `broadcast-channel.{id}` | `{ channel_id, name, owner_uid, last_signal, action }` |
| `WalkieTypieConnectionUpdated` | `walkie-typie.updated` | Private `App.Models.User.{uid}` | `{ connection_data }` |
| `WalkieTypieContentUpdated` | `walkie-typie.content` | Private `App.Models.User.{uid}` | `{ content_data: { text, branch_id, sender_uid } }` |
| `WalkieTypieSignal` | `walkie-typie.content` | Private `App.Models.User.{partnerUid}` | `{ content_data: { branch_id, sender_uid, timestamp, text: null } }` |

**Client whisper** (no server): `'typing'` on private `walkie-typie.{uid1}.{uid2}` (sorted), 50ms debounce.

**WT layers:** Whisper (50ms) → IndexedDB save (200ms) → Server commit (2s) + signal event → partner re-sync.

### PWA & Service Worker (Workbox)

**`sw.js` is auto-generated — never edit it directly.** Edit `sw-src.js` instead and run `npm run build:sw`.

- **Build:** `npm run build:sw` runs `workbox-build.injectManifest()` → scans `frontend/` → injects versioned manifest (URL + content hash per file) into `sw-src.js` → outputs `sw.js`
- **Precache:** Workbox `precacheAndRoute()` handles all core files (CSS, JS, locales, audio, images). Per-file revision hashes — only changed files are re-downloaded on update. No manual `CACHE_NAME` bumps needed.
- **Navigation:** `NavigationRoute` serves cached `/index.html` for all SPA routes
- **Runtime SWR:** Non-precached same-origin GET requests (MOD files, etc.) use `StaleWhileRevalidate` strategy with `runtime-swr` cache. `/api/` and cross-origin requests are excluded.
- **Update flow:** `updatefound` → toast → `SKIP_WAITING` → silent takeover (no forced reload)
- **MOD files are NOT precached.** `mods/mod-loader.js` is the only MOD entry point in the precache. All other MOD files (`mods/*/`) are cached lazily by the runtime SWR handler on first page load.
- **Glob config** is in `scripts/build-sw.js`. `globIgnores` excludes `javascript/vendor/textmode.js` (large WebGL2 lib, ascii-animator MOD only).
- **Legacy cleanup:** Activate handler deletes old `blackboard-*` caches from before Workbox migration.

## MOD System v2.1 (Instance-Based, ADD/DELETE Model)

Self-contained plug-and-play features. **1 Instance = 1 Feature Button.** Templates are blueprints instantiated multiple times with independent config and order. 4th main nav section (`mods`) has list + config pages.

### CRITICAL: ADD/DELETE Model (NOT Toggle)

**Instance existence = enabled.** There is no ON/OFF toggle. To "disable" a MOD, delete the instance. To "enable", add a new one. The `enabled` field does NOT exist on instances.

Instance data model (persisted in `localStorage['mod-instances']`):
```js
{ instanceId: 'i_translate_1', templateId: 'translate', order: 0, config: { targetLang: 'zh-TW', provider: 'google' } }
```

### Boot Sequence

`i18n:ready` → `loadAllMods()` → discover folders via Nginx autoindex →
Phase 1: fetch manifest.json per folder → validate manifest → register in ModState →
wire context factory → run migration (v1→v2→v3, legacy data only) → init shared config → fetch MOD-local locales →
Phase 2: identify templates with instances → `import()` mod.js for those only →
merge data+code → validate full template → register hooks + tools →
create DOM (buttons + shelves) → call `template.init(ctx)` → dispatch `mods:loaded`

On-demand: when user ADDs first instance of an unused template → `ensureCodeLoaded(templateId)` lazily imports mod.js, validates, registers hooks/tools, calls init(). Idempotent — cached after first call.

**No auto-instantiation:** First boot starts with zero instances. Users add instances manually from the template catalog. `defaultInstances` in templates are used only by v2→v3 migration for legacy data.

### Architecture

- **`mod-loader.js`** — discovers MOD folders via Nginx autoindex. Two-phase loading: Phase 1 fetches `manifest.json` (data) for ALL folders; Phase 2 `import()` `mod.js` (code) only for templates with active instances. `ensureCodeLoaded(templateId)` provides on-demand lazy loading for first-time ADD. Exports: `getTemplate()`, `getAllTemplates()`, `getInstances()`, `getInstancesByTemplate()`, `ensureCodeLoaded()`, `rebuildInstanceButtons()`, `updateInstanceButton()`, `removeInstanceButton()`
- **`mod-state.js`** — instance CRUD + template registry + shared config storage. `addInstance()` respects `maxInstances` cap. `removeInstance()` always allowed (no guard on maxInstances). Shared config API: `getSharedConfig/setSharedConfig/getSharedConfigAll/getSharedConfigSchema/initSharedDefaults`. Dispatches `mods:instanceAdded/Removed`, `mods:configChanged`, `mods:reordered`, `mods:sharedConfigChanged`
- **`mod-context.js`** — `createModContext()` builds sandboxed API: `ctx.instance.*`, `ctx.board.*`, `ctx.ui.*`, `ctx.i18n.*`, `ctx.storage.*`, `ctx.net.*`, `ctx.file.*`, `ctx.events.*`, `ctx.hooks.*`, `ctx.query.*`. Read the file for full API reference.
- **`mod-board-provider.js`** — board data access (metadata providers, history, file cache)
- **`mod-field-registry.js`** — config field type registry. Built-in: `select`, `text`, `range`, `toggle`, `info`, `action`. Custom via `ctx.ui.registerFieldType()`
- **`mod-hooks.js`** — priority-ordered pipeline. API: `register/unregister/unregisterAll/run/has`. Hook points not yet instrumented (Phase C deferred).
- **`mod-tools.js`** — cross-MOD tool registry (OpenAI function-calling compatible). API: `register/unregisterAll/executeTool/getToolDefinitions/hasTool/getToolNames`
- **`mods-manager.js`** — list page (template catalog + active instances, unified InfiniteList via `.mods-navigable` class) + config page (shared config ENGINE section + per-instance INSTANCE section, instance management: UP/DOWN/DELETE). Field creators use an accessor pattern `{ get(key), set(key, val) }` so the same renderer works for both shared and instance fields.
- **`feature-shelf.js`** — feature button visibility per page (driven by `template.pages` keys), click → deactivate previous → build ModContext → `template.activate(ctx)`. Exports: `openShelf()`, `closeShelf()`

### Instance UI Positions (4)

| Position | What | Built by |
|----------|------|----------|
| List page | Item in active instances list | Framework |
| Config page | Config fields + UP/DOWN/DELETE | Framework |
| Feature button | Icon button in HUD bar | Framework (data-instance-id, CSS ::after icon) |
| Shelf panel | Content when button clicked | **Template** fills in `init()` (shared per template) |

### Shared Config (Group-Level Settings)

When multiple templates in the same `group` need identical settings (e.g. LLM provider, API key, model), use **shared config** instead of duplicating fields on every instance.

**How it works:**
1. ONE template in the group declares `sharedConfigSchema` in its `manifest.json` (same field format as `configSchema`)
2. Framework stores shared values in `localStorage['mod-shared-config']` under the group name
3. When rendering config for ANY instance in the group, framework shows shared fields in an "ENGINE" section above per-instance fields
4. `mod-context.js` merges shared values into `ctx.config` before freezing — MOD code reads `config.provider` without knowing it's shared
5. Changing a shared field fires `mods:sharedConfigChanged` event and calls `template.onSharedConfigChange(key, value)` on all templates in the group

**Config page layout (for any instance in a group with shared config):**
```
── ENGINE ──                    ← shared config section
  Provider:     [client ▼]
  Temperature:  [===●===] 0.3

── INSTANCE ──                  ← per-instance config section
  Prompt:       [____________]
  Icon:         [● ○ ○ ○ ○ ○]
```

**Framework APIs:**
- `ctx.instance.getSharedConfig(key)` / `ctx.instance.setSharedConfig(key, val)` — explicit access from MOD code
- `ModState.getSharedConfig(group, key)` / `ModState.setSharedConfig(group, key, val)` — direct API (use in shared helpers like `_shared.js`)

**Example:** The `llm` group (llm, llm-bb, llm-bc) shares provider, clientModel, apiKey, temperature. Only `llm/manifest.json` declares `sharedConfigSchema`; `llm-bb` and `llm-bc` inherit from the group automatically.

**Lifecycle method:** Implement `onSharedConfigChange(key, value)` on the template object to react to shared config changes (e.g. re-trigger model prewarming when provider changes).

### Adding a New Template

1. Copy `mods/_template/` → `mods/{your-id}/` (full skeleton with docs)
2. Edit `manifest.json`: set `id` (MUST match folder name), `group`, `nameKey`, `descriptionKey`, `configSchema`, `defaultInstances`, `providers`, `pages`
3. Edit `mod.js`: implement `getButtonDataId()`, `getInstanceName()`, `init(ctx)`, `activate(ctx)`, and any other lifecycle methods
4. Create `mods/{your-id}/locales/{en,zh-TW,default}.json`
5. Add icon: CSS `.feature-btn[data-feature-btn="{btn-id}"]::after { mask-image: url(...) }` OR implement `getIconUrl(config)` in mod.js
6. Optionally add `tools[]` and `hooks[]` in mod.js
7. Refresh browser — MOD appears automatically in catalog (no manifest file to edit!)
8. MOD files are cached automatically by SW's runtime SWR — **do NOT add MOD files to the precache glob in `scripts/build-sw.js`**

**Data/Code separation:** Each MOD folder contains `manifest.json` (pure data: id, configSchema, pages, etc.) and `mod.js` (pure code: functions, lifecycle methods). At boot, mod-loader merges `{ ...manifestData, ...modCode }` into a single template object. The `manifest.json.id` MUST match the folder name.

### MOD Development Principles

**1. Use framework APIs — never bypass them.**
- Text access: `ctx.board.getText()`, `ctx.board.getTextarea()`, `ctx.board.insertAtCursor()`
- Config: `ctx.instance.getConfig(key)` / `ctx.instance.setConfig(key, val)` (per-instance)
- Shared config: `ctx.instance.getSharedConfig(key)` / `ctx.instance.setSharedConfig(key, val)` (group-level)
- Events: `ctx.events.on()` / `ctx.events.off()` (auto-cleanup on deactivate)
- UI: `ctx.ui.toast()`, `ctx.ui.getShelfElement()`, `ctx.ui.registerFieldType()`
- Storage: `ctx.storage.get(key)` / `ctx.storage.set(key, val)` (per-instance sandboxed)
- If an API is missing, add it to the framework (mod-context.js, mod-board-provider.js, etc.)
  — do NOT hardcode DOM selectors for framework elements (.feature-container, .feature-btn, etc.)

**2. No module-level mutable state.** Templates are singletons shared across instances.
- Store per-instance state in `ctx.storage` or instance config
- Store per-template state on `this` (the template object)
- Never use module-level `let` for state that varies per activation
- Never pollute `window.*`

**3. Expose capabilities via tools and hooks.**
- If your MOD does something another MOD could use, register it in `tools[]`
- Tools use OpenAI function-calling schema for future LLM agent compatibility
- Use `ctx.hooks.register()` for pipeline-based interception (when instrumented)

**4. Per-instance page visibility.** If a template needs different instances on different pages,
implement `getDeployPages(config)` returning an array of page IDs. The framework calls this
per-instance to determine button visibility (falls back to `template.pages` keys if absent).

**5. Field types.** Use built-in types: `select`, `text`, `textarea`, `range`, `toggle`,
`icon-picker`, `info`, `action`. Register custom types via `ctx.ui.registerFieldType()` only
when built-in types genuinely don't cover the use case.

**6. Design for composition.** MODs should be small, focused, and composable:
- 1 instance = 1 feature button = 1 specific behavior
- Prefer multiple simple instances over one complex config
- The `configSchema` should be scannable in under 5 seconds

**7. Cross-MOD loading convention (`data-loading`).** When a MOD performs async operations:
- Set `element.dataset.loading = 'true'` on the affected element (textarea, button, etc.)
- Remove in `finally` block: `delete element.dataset.loading`
- For toasts: use `ctx.ui.toastLoading()` or `BBMessage.loading()` (auto-sets attribute)
- ASCII Animator MOD responds with visual animations (gated behind `.aa-active` class on `<html>`)
- Without ASCII Animator installed, `data-loading` is inert — zero visual effect
- This is a convention-based protocol: producers never import the consumer

**8. Yellow-zone bypasses.** When no framework API exists for what you need:
- Direct DOM access is acceptable WITH a comment: `// BYPASS: reason, migrate when API X exists`
- Examples: textarea event listeners (no `record:textChanged` hook yet), secondary textarea reads
- When the framework API is added, migrate all yellow-zone code to use it

### Versioning

**Platform version** — `PLATFORM_VERSION` in `frontend/javascript/version.js`, displayed in blackboard-misc page.

**MOD API version** — `MOD_API_VERSION` in the same file. Templates can declare `minApiVersion: N`; the framework warns at boot if `MOD_API_VERSION < N`.

**Template version** — `template.version` (SemVer string). Displayed in mods-manager list and config pages.

### Current Templates (12)

| ID | Group | maxInstances | Providers | Tools |
|----|-------|-------------|-----------|-------|
| `translate` | linguistics | unlimited | google | `translate_text` |
| `speech-to-text` | linguistics | 1 | google-speech | — |
| `markdown-preview` | utilities | 1 | marked (client) | — |
| `file-attach` | utilities | 2 | — | — |
| `calculator` | utilities | 1 | — | — |
| `llm` | llm | unlimited | client (WebLLM), server (Ollama), apikey (cloud) | — |
| `llm-bb` | llm | unlimited | (shared with llm) | — |
| `llm-bc` | llm | unlimited | (shared with llm) | — |
| `llm-file` | llm | unlimited | server (Ollama) | — |
| `light-theme` | theme | 1 | — | — |
| `info-screensaver` | screensaver | 1 | — | — |
| `ascii-animator` | decoration | 1 | textmode.js (WebGL2) | — |

### Future Framework Roadmap

**C1. Hook instrumentation** — Instrument `ModHooks.run()` in core modules:
`board:beforeCommit`, `board:afterFetch`, `record:textChanged`, `branch:switched`.
Enables: auto-translate on typing, AI reactions to new content.

**C2. Agent loop** — LLM MOD multi-turn tool calling:
`ModTools.getToolDefinitions()` → send to LLM → parse tool_use → `ModTools.executeTool()` → feed result back → loop.
Enables: autonomous AI that can translate, search, summarize in sequence.

**C3. Board write API** — `ctx.board.createRecord(text)`, `ctx.board.commit()`.
Enables: AI agent writes findings to new records, not just shelf output.

**C4. Service registry** — `ctx.services.register(name, impl)` / `ctx.services.get(templateId, name)`.
Enables: MOD-to-MOD service calls without brittle tool-name coupling.

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
- `/mods/` (exact) — autoindex JSON for MOD folder discovery (`autoindex_format json`)
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
claude mcp add my-db -- npx -y @bytebase/dbhub --dsn "postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@localhost:5431/<POSTGRES_DB>"
```

## Custom Audit Agents (`.claude/agents/`)

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| **css-auditor** | CRT theme, flex layout, dark/light mode | After CSS changes |
| **i18n-checker** | Locale key parity, hardcoded strings | After adding UI text |
| **event-flow-tracer** | Race conditions, orphaned events | After changing event dispatch/listeners |

---

# ═══════════════════════════════════════════════════════════════
# NON-MAIN MODULE: Restaurant
# This section is ISOLATED from the main MyCLI platform above.
# When working on main features, IGNORE this section entirely.
# When working on restaurant features, refer to BOTH the shared
# infrastructure above (Docker, testing, i18n) AND this section.
# ═══════════════════════════════════════════════════════════════

## Restaurant Module

Standalone ordering system embedded in the MyCLI platform. Uses a **separate PostgreSQL connection** (`restaurant`) — completely independent from the main `my-cli-db`.

### Backend (`app/Restaurant/`)

All restaurant backend code is isolated under `App\Restaurant\` namespace with a dedicated route file `routes/restaurant.php` (registered via `bootstrap/app.php` `then` callback).

| Feature | Controller | Service |
|---------|-----------|---------|
| Orders | `Restaurant\Controllers\RestaurantOrderController` | `Restaurant\Services\RestaurantOrderService` |
| Branch & Sessions | `Restaurant\Controllers\RestaurantBranchController` | `Restaurant\Services\RestaurantBranchService` |
| Deliverers | `Restaurant\Controllers\RestaurantDelivererController` | `Restaurant\Services\RestaurantDelivererService` |

**Event:** `Restaurant\Events\RestaurantOrderUpdated` — `broadcastAs('restaurant.order.updated')` on public channel `restaurant-orders.{branchCode}`, payload `{ order_number, action, branch_code }`.

**Mail:** `Restaurant\Mail\RestaurantReceiptMail` — view at `resources/views/restaurant/receipt.blade.php`.

### Database Schema (separate PostgreSQL connection `restaurant`)

- **menu_items** — category (JSONB i18n), name (JSONB i18n), price, image, options_schema (JSONB), timeslots (JSONB), sort_order, available (bool)
- **orders** — order_number (unique), status (default 'preparing'), total, branch_id FK nullable, table_number, session_token
- **order_items** — order_id FK cascade, menu_item_id FK nullable, name (snapshot), base_price, qty, options (JSONB), subtotal
- **branches** — code (unique), name; seeded with TM (Tuen Mun), TSW (Tin Shui Wai)
- **restaurant_sessions** — branch_id FK cascade, table_number, token (unique), status (default 'active'), expires_at
