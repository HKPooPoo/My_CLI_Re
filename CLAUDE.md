# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow (MANDATORY)

**Every task must be wrapped in two commits — one BEFORE changes and one AFTER.**

1. **Before starting work:** Stage and commit all current uncommitted changes with message `WIP: before <short task description>`
2. **After completing work:** Stage and commit all changes with a descriptive message summarising what was done
3. Do NOT push to remote — this repo is local-only
4. Keep commits atomic: one task = one before/after commit pair

## Project Overview

**My CLI Re** (My Clean Logging Interface) is a versioned communication platform that applies a unified Board model across three visibility scopes — personal (Blackboard), paired (Walkie-Typie), and public (Broadcast). It is a Docker-based full-stack application with a Laravel 12 (PHP-FPM) backend and a vanilla JavaScript frontend served by Nginx, featuring a retro CRT terminal aesthetic.

## CRITICAL: Board Model & Operation Semantics

**This project uses VCS-inspired terminology but the operations do NOT match git semantics. Never assume git behavior.**

### Unified Board Model

Every feature in this application is built on the same data primitive:

```
Board = timestamped text record (text + optional file attachments)

Blackboard  = Board(scope: SELF)    → personal, multi-branch timelines
Walkie-Typie = Board(scope: PAIR)   → P2P paired boards, real-time whisper
Broadcast    = Board(scope: PUBLIC) → public channels, one-to-many
```

A **record** is a single snapshot: `{ branch_id, timestamp, text, file_hash }`. A **branch** (BB/WT) or **channel** (BC) is a collection of records sharing the same `branch_id`/`channel_id`. Records are ordered by `timestamp` descending (newest first).

### Operation Dictionary (What Each Term ACTUALLY Means)

| Term | Git Meaning | MyCLI Meaning |
|------|------------|---------------|
| **Push** | Upload commits to remote | Navigate toward NEWER records (decrement head index) |
| **Pull** | Download commits from remote | Navigate toward OLDER records (increment head index) |
| **Commit** | Create a snapshot in history | Upload ALL local records to server (full-branch replacement, Last-Write-Wins) |
| **Checkout** | Switch to a branch/commit | Switch to a different branch, or download a server branch to local |
| **Fork** | (not a git command) | Duplicate all records from one branch into a new independent branch (NO parent pointer, NO ancestry) |
| **Branch** | Pointer to a commit in a DAG | Independent flat timeline of text snapshots (NO parent-child relationships, NO tree structure) |
| **HEAD** | Pointer to current commit | In-memory integer offset into the record list (0 = newest) |
| **Drop** | (not a git command) | Delete server-side records for a branch |
| **Clean** | (not a git command) | Wipe all records in a branch, leaving one empty placeholder |

### What Does NOT Exist

- **No tree/DAG structure** — branches are completely flat and independent
- **No parent pointers** — fork copies data but stores no link to the source
- **No merge** — there is no concept of merging two branches
- **No diff infrastructure** — no common ancestor, no built-in comparison
- **No commit graph** — each branch is just a sorted list of timestamped records
- **No conflict resolution** — commit is full server replacement (Last-Write-Wins)

### Storage Architecture

```
Local-first, manual-sync:
  IndexedDB (primary) ──commit──▶ PostgreSQL (backup)
                       ◀──checkout──

Owner tag (encodes sync state as string):
  "local"                          → never synced
  "local, online/{uid} [synced]"   → matches server
  "local, online/{uid} [asynced]"  → locally modified since last sync
```

BB and WT store records locally in IndexedDB; the server is a secondary store the user explicitly syncs to. BC owner stores locally then CASTs to server; BC readers fetch from server only (30s cache, in-memory).

### branch_id Generation

`branch_id = Date.now()` — a millisecond Unix timestamp at creation time. It is NOT sequential, NOT auto-incremented, and carries NO semantic meaning beyond being a unique identifier. The branch name is a separate display label stored redundantly on every record.

### Virtual State (BB only)

When the user PUSHes past head 0 (newest record), the system enters "virtual" state — a blank textarea with no backing record. Typing creates a new record and exits virtual mode. This enables creating new entries without an explicit "new" button.

## Development Commands

### Start / Stop the Stack
```bash
docker compose up -d --build    # Build and start all services
docker compose down             # Stop all services
docker compose logs -f api      # Tail API logs
docker compose logs -f reverb   # Tail WebSocket logs
```

### Backend (Laravel) — run inside the `api` container
```bash
docker exec my-cli-api php artisan migrate
docker exec my-cli-api php artisan migrate:fresh --seed
docker exec my-cli-api php artisan key:generate
docker exec my-cli-api php artisan tinker
docker exec my-cli-api php artisan test                          # Run all tests
docker exec my-cli-api php artisan test --filter TestClassName   # Run single test
docker exec my-cli-api ./vendor/bin/pint                         # Lint (Laravel Pint)
```

### First-time Backend Setup
```bash
docker exec my-cli-api sh -c "cp .env.example .env && php artisan key:generate && php artisan migrate --force"
```

### Services & Ports
| Service | URL |
|---------|-----|
| Frontend | `http://localhost` |
| API | `http://localhost/api` |
| PgAdmin | `http://localhost:8080` |
| Mailpit | `http://localhost:8025` |
| Reverb (WS) | `ws://localhost:8081` |
| PostgreSQL | `localhost:5431` |

## Architecture

### High-Level Stack
- **Nginx** — serves `frontend/` as a static SPA and reverse-proxies `/api` to PHP-FPM
- **api** — Laravel 12 PHP-FPM application (JSON API only, no Blade views)
- **reverb** — Laravel Reverb WebSocket server for real-time broadcasting
- **queue** — Laravel queue worker (`php artisan queue:listen`)
- **db** — PostgreSQL 16
- **redis** — Sessions, cache, and queues

### Backend Structure (`backend/`)

```
app/
  Http/Controllers/   # Thin controllers — validate input, call service, return JSON
  Services/           # All business logic lives here
  Events/             # Broadcastable events for Reverb
  Models/             # Eloquent models
config/               # Laravel config (cors.php, broadcasting.php, etc.)
routes/api.php        # All API routes (no web.php routes used)
database/migrations/  # Schema definitions
```

**Key pattern:** Controllers are kept thin — they validate the request, call a Service method, and return the result. All logic is in Services.

**Rate limiting strategy (defined in `routes/api.php`):**
- AI endpoints (translate, speech): 10 req/min
- Write/auth endpoints: 30 req/min
- Public reads: 120 req/min
- Auth commands (/passwd, /bind): 10 req/min

### Core Features & Their Services

| Feature | Controller | Service | Description |
|---------|-----------|---------|-------------|
| **Blackboard** | `BlackboardController` | `BlackboardService` | Board(SELF) — personal multi-branch timelines with local-first storage |
| **Walkie-Typie** | `WalkieTypieController` | `WalkieTypieBoardService` | Board(PAIR) — symmetric P2P paired boards with real-time whisper |
| **Broadcast Channels** | `BroadcastChannelController` | `BroadcastChannelService` | Board(PUBLIC) — public channels, owner writes + readers fetch, Last-Write-Wins |
| **Files** | `FileController` | `FileService` | SHA-256 deduplicated file storage (up to 10GB) |
| **Auth** | `AuthController` | `AuthService` | UID+passcode auth, email binding, `/passwd` & `/bind` commands |

### Database Schema (key tables)
- `users` — uid (unique), passcode, title, email
- `blackboards` — user_id (FK), branch_id (varchar), branch_name, timestamp (bigint ms), text, file_hash; UNIQUE(user_id, branch_id, timestamp)
- `walkie_typie_connections` — user_id (FK), partner_id (FK), partner_tag, my_branch_id, partner_branch_id, last_signal; UNIQUE(user_id, partner_id)
- `walkie_typie_boards` — user_id (FK), branch_id, timestamp (bigint ms), text, file_hash; UNIQUE(user_id, branch_id, timestamp)
- `broadcast_channels` — name (unique), user_id (FK), last_signal (bigint ms)
- `broadcast_boards` — channel_id (FK cascade), timestamp (bigint ms), text, file_hash; UNIQUE(channel_id, timestamp)
- `broadcast_pins` — user_id (FK cascade), channel_id (FK cascade); UNIQUE(user_id, channel_id)
- `files` — hash (unique), user_id (FK), original_name, mime_type, size (bigint), disk_path, status (default 'staged')

**File status lifecycle:** `staged` → `committed` → `orphaned` (orphaned files cleaned up after 24h)

### Frontend Structure (`frontend/`)

The frontend is a **multi-section SPA** with no framework — pure HTML, CSS, and ES modules organized by feature.

```
javascript/
  services/           # API/data layer (api.js, auth-service.js, broadcast-service.js, mod-service.js, etc.)
  blackboard*.js      # Blackboard feature modules
  walkie-typie*.js    # Walkie-Typie feature modules
  broadcast*.js       # Broadcast Channels feature modules
  mod-state.js        # MOD state + config persistence (decoupled from registry)
  mods-manager.js     # MOD Manager UI (list + config pages, consumes mod-loader)
  feature-shelf.js    # Feature shelf lateral panel + MOD-aware button visibility (dynamic DOM)
  echo-service.js     # Singleton Laravel Echo instance (shared by all modules)
  indexedDB.js        # IndexedDB wrapper for client-side persistence
  audio.js            # Sound effects for UI
  multiStepButton.js  # Reusable multi-step confirmation button component

mods/
  mod-manifest.js     # Static import list (single source of truth for all MODs)
  mod-loader.js       # Loads MODs from manifest, merges i18n, creates DOM, calls init()
  translate/
    mod.js            # Translate MOD (4 languages, 2 providers: google + libretranslate)
    locales/{en,zh-TW,default}.json
  speech-to-text/
    mod.js            # Speech-to-Text MOD (Google Cloud Speech)
    locales/{en,zh-TW,default}.json
  markdown-preview/
    mod.js            # Markdown Preview MOD (client-side marked.js)
    locales/{en,zh-TW,default}.json
```

**Frontend architectural patterns:**
- **Event-driven:** modules communicate via `window.dispatchEvent()` with custom events
- **Hybrid storage:** IndexedDB for personal/draft data; PostgreSQL (via API) for shared/broadcast data
- **Real-time:** Laravel Echo (built on Reverb) subscribed to private and public channels
- **Service layer:** `services/` abstracts all HTTP calls; feature modules call services, not `fetch()` directly

### Navigation System (`navi.js`)

Hierarchical two-level navigation that drives the entire SPA page switching:

- **Main navi items** (`data-navi-item`): `blackboard`, `walkie-typie`, `broadcast`, `mods`
- **Sub-navi items** (`data-sub-navi-item`): e.g. blackboard has `blackboard-log`, `blackboard-branch`, `auth`, `blackboard-misc`; mods has `mods-list`, `mods-config`
- Each main item stores state in `stateOfEachNaviItem[name]` (current sub-index, DOM refs, visited flag)
- Sub-navi position rendered via CSS `translateX()` on `.sub-navi-track`; supports click, wheel, and touch swipe
- **`updateNaviPosition()`** is the core function: repositions sub-navi track, highlights active item, calls `updatePage()`, triggers CRT glitch effect, saves to localStorage
- **`updatePage(subNaviItem)`** toggles `.active` on `.page` elements and controls visibility of push/pull buttons, head-indicator, and feature scaffold based on page CSS classes: `.can-push-pull`, `.show-branch`, `.have-feature`
- **Gotcha:** `updateNaviPosition()` always calls `updatePage()` which changes the visible page. Never call it from background data fetches unless the relevant navi section is currently active.

### Custom Events (Inter-Module Communication)

| Event | Emitter | Payload | Purpose |
|-------|---------|---------|---------|
| `auth:updated` | auth.js | — | Login/logout/register completed; triggers HUD, blackboard, broadcast refreshes |
| `navi:pageChanged` | navi.js | `{ page }` | Sub-navigation selection changed; modules listen to activate/deactivate |
| `list:selectionChanged` | InfiniteList | `{ index, item }` | List cursor moved (blackboard VCS, walkie-typie, broadcast) |
| `list:updated` | Various | — | VCS/broadcast list data refreshed |
| `broadcast:selected` | broadcast-list.js | `ch` (channel obj) | Channel clicked in broadcast list |
| `broadcast:cleared` | broadcast-list.js | — | Current channel deleted |
| `broadcast:channelRenamed` | broadcast-channel.js | `{ channelId, newName }` | Channel renamed |
| `broadcast:signalUpdated` | broadcast-channel.js | `{ channelId }` | Board content updated |
| `blackboard:branchRename` | blackboard-branch.js | — | Branch name edited |
| `pwa:installable` | pwa.js | — | PWA install prompt available |
| `i18n:ready` | i18n.js | — | Locale loaded and DOM rendered |
| `mods:loaded` | mod-loader.js | — | All templates loaded and init() called; mods-manager initialises |
| `mods:changed` | mod-state.js | `{ instanceId, templateId, enabled }` | Instance toggled on/off; feature-shelf re-evaluates button visibility |
| `mods:configChanged` | mod-state.js | `{ instanceId, templateId, key, value }` | Instance config changed; mods-manager re-renders fields (showWhen) + updates button icon |
| `mods:instanceAdded` | mod-state.js | `{ instance }` | New instance created; re-render list + create button |
| `mods:instanceRemoved` | mod-state.js | `{ instanceId, templateId }` | Instance deleted; re-render list + remove button |
| `mods:reordered` | mod-state.js | — | Instance order changed; re-render list + reorder buttons |
| `mods:selected` | mods-manager.js | `{ instanceId }` | Instance selected in list (500ms debounce); config page renders |
| `settings:maxSlotChanged` | misc.js | — | MAX_SLOT range slider changed; lists adjust limits |

### i18n System (`i18n.js`)

- Locale JSON files at `/locales/{locale}.json` (en, zh-TW, zh-CN)
- **MOD-local locales** at `/mods/{mod-id}/locales/{locale}.json` — fetched and deep-merged at runtime via `mergeStrings(partial)`
- Locale stored in `localStorage['locale']`, defaults to `'en'`
- **DOM binding:** `data-i18n="key"` sets `textContent`; `data-i18n-placeholder="key"` sets `placeholder`
- **JS usage:** `t('auth.loginError', { uid })` — dot-notation key lookup with `{var}` interpolation
- **`mergeStrings(partial)`** — deep-merges a partial object into global `_strings`; used by mod-loader to inject MOD-local i18n at boot
- `renderDOM()` scans all `data-i18n*` elements — be careful with buttons managed by MultiStepButton (their text is JS-controlled; `data-i18n` on them causes conflicts when `renderDOM()` resets armed-state text)
- `setLocale(locale)` persists, reloads, rerenders, fires `i18n:ready`

### i18n Requirement (MANDATORY)

**All user-facing strings MUST use the i18n system.** Never hardcode display text in JS or HTML.

- **JS:** Use `t('section.key')` for all user-visible text (labels, messages, placeholders, fallbacks)
- **HTML:** Use `data-i18n="section.key"` for `textContent`, `data-i18n-placeholder="section.key"` for `placeholder`
- **New strings:** Add the key to BOTH `frontend/locales/en.json` AND `frontend/locales/zh-TW.json`
- **Interpolation:** `t('auth.welcome', { uid })` replaces `{uid}` in the locale string
- **Exception:** Internal comparison constants (e.g. API status codes like `'ONLINE'`/`'OFFLINE'`) are not display strings and do not need i18n
- **MultiStepButton conflict:** Do NOT put `data-i18n` on elements whose text is managed by MultiStepButton — `renderDOM()` will overwrite the armed-state label

### MultiStepButton Component (`multiStepButton.js`)

Two modes:
- **INSTANT:** `new MultiStepButton(el, { action })` — single click fires action
- **CONFIRM:** `new MultiStepButton(el, { action, confirm: true, confirmLabel })` — first click arms (shows confirmLabel, adds `.btn-armed`), second click fires; auto-resets on timeout (default 3s)

Prevents double-fire via `aria-busy="true"` during async actions. No artificial cooldown after completion.

### CSS Architecture (`stylesheets/`)

**Theming via CSS custom properties on `:root`:**
- Dark (CRT) mode is default; `data-theme="light"` on `:root` switches to light mode
- Key variables: `--text-green`, `--text-orange`, `--text-red`, `--text-cyan`, `--bg-primary`, `--bg-secondary`
- Light mode disables all glow/shadow effects and CRT scanlines
- Theme persisted to `localStorage["data-theme"]`

**CRT effects (`crt-vfx.css`):**
- `.crt-scanner`: Repeating scanline gradient + vignette overlay
- `.crt-noise-layer` + `.glitchEffect`: 1.2s hue-rotation/brightness-flicker animation triggered on sub-navi change
- `.crt-text-orange`, `.crt-text-green`, etc.: Atomic classes applying color + text-shadow glow

**Layout constants:** `--container-width: clamp(300px, 86vw, 512px)`, responsive `--font-size: clamp(0.875rem, ...)`, fixed `--header-height`, `--footer-height`, `--navi-height`, `--sub-navi-height`

### Toast System (`toast.js` + `blackboard-msg.js`)

- `ToastMessager.info/error/success(text, duration)` creates animated toasts in `#toast-container`
- `BBMessage` is the semantic facade: `BBMessage.info(text)` prefixes "SYSTEM > ", `BBMessage.error(text)` prefixes "CRITICAL > "
- Returns `{ update(text, duration), close() }` for imperative control of running toasts

### Real-Time (WebSocket) Architecture

`echo-service.js` creates a **single** Laravel Echo instance connecting to Reverb (shared by all features).

**Server-side events:**

| Event Class | `broadcastAs()` | Channel | Type | Payload |
|-------------|-----------------|---------|------|---------|
| `BroadcastChannelUpdated` | `broadcast.channel.updated` | `broadcast-channel.{channelId}` | Public | `{ channel_id, name, owner_uid, last_signal, action: 'cast'\|'rename'\|'destroy' }` |
| `WalkieTypieConnectionUpdated` | `walkie-typie.updated` | `App.Models.User.{uid}` | Private | `{ connection_data }` |
| `WalkieTypieContentUpdated` | `walkie-typie.content` | `App.Models.User.{uid}` | Private | `{ content_data: { text, branch_id, sender_uid } }` |
| `WalkieTypieSignal` | `walkie-typie.content` | `App.Models.User.{uid}` | Private | `{ content_data: { branch_id, sender_uid, timestamp, text: null } }` |

**Client-side whisper events (no server involvement):**

| Whisper | Channel | Payload | Debounce |
|---------|---------|---------|----------|
| `'typing'` | `walkie-typie.{uid1}.{uid2}` (private, sorted alphabetically) | `{ from, text, bin }` | 50ms |

**WT real-time layers:**
1. **Whisper** (50ms) — full textarea content sent client-to-client via Reverb relay
2. **IndexedDB save** (200ms) — local persistence
3. **Server commit** (2s) — PostgreSQL persistence + `WalkieTypieSignal` event triggers partner re-sync

**BC real-time flow:** Owner CASTs → server replaces all boards → fires `BroadcastChannelUpdated` → readers' cache invalidated → re-fetch from API

### PWA & Service Worker

- **Caching strategy:** Stale-while-revalidate for static assets; `/api/` requests always bypass SW
- **Update flow:** SW `updatefound` → `showUpdateToast()` → posts `SKIP_WAITING` message → new SW takes control silently (no forced reload)
- **Install (A2HS):** `beforeinstallprompt` stored → `pwa:installable` event dispatched → auth.js shows install UI → `window.installPWA()` triggers prompt

### Nginx Routing (key rules)
- `/api/files` — upload streaming with request buffering disabled, 3600s timeout
- `/app` — proxied to Reverb WebSocket
- Everything else under `/api` — PHP-FPM FastCGI
- All other paths — `index.html` (SPA fallback)

### MOD System (Instance-Based Architecture)

Self-contained, plug-and-play feature system. **1 Instance = 1 Feature Button**. Templates (`mod.js`) are blueprints that can be instantiated multiple times, each with independent config, enabled state, and order. The 4th main navigation section (`mods`) has two pages: list (template catalog + active instances) + config.

#### Architecture: `mod-manifest.js` → `mod-loader.js` → Templates → Instances

**Boot sequence:** `i18n:ready` → `loadAllMods()` → register templates in ModState → run migration (v1→v2→v3) → create default instances if none exist → fetch MOD-local locales → create DOM (buttons from instances + shelves from templates) → call each template's `init()` → dispatch `mods:loaded` → `mods-manager.init()`

A `setTimeout(bootMods, 0)` fallback in `index.html` ensures boot even if `i18n:ready` fires before the listener is registered.

**Manifest** (`mods/mod-manifest.js`): Single source of truth — static `export { default as X }` for each template.

**Loader** (`mods/mod-loader.js`):
- Imports all templates from manifest, calls `ModState.registerTemplate(id, def)` for each
- Runs migration chain (v1→v2→v3), then `ensureDefaultInstances()` per template
- Fetches `mods/{id}/locales/{locale}.json` and deep-merges via `mergeStrings()` (fallback: locale → en → default)
- Creates feature buttons **from instances** (`<button class="feature-btn" data-feature-btn="{getButtonDataId(config)}" data-instance-id="{instanceId}">`)
- Creates empty shelf panels per template (`<div class="feature-shelf" data-feature-shelf="{id}">`) — template fills in `init()`
- Calls `template.init()` once per template (not per instance)
- Exports: `getTemplate(id)`, `getAllTemplates()`, `getInstances()`, `getInstancesByTemplate(id)`, `rebuildInstanceButtons()`, `updateInstanceButton(instanceId)`, `removeInstanceButton(instanceId)`
- Always dispatches `mods:loaded` even on partial failure (try/catch per template)

#### Template Interface

Every template in `mods/{id}/mod.js` exports a default object:

```js
export default {
    id: 'translate',                    // unique, matches folder name
    group: 'linguistics',               // UI grouping: 'linguistics' | 'utilities' | 'llm'
    nameKey: 'mods.translate.name',     // i18n key
    descriptionKey: 'mods.translate.desc',

    singleton: false,                   // true = only 1 instance allowed

    getButtonDataId(config) {           // instance config → button data-feature-btn attribute
        return 'translate-' + config.targetLang;  // → CSS ::after mask-image
    },
    getInstanceName(config, t) {        // display name in list (differentiates instances)
        return t('mods.translate.name') + ' → ' + t('mods.translate.lang.' + config.targetLang);
    },
    defaultInstances: [                 // created on first run (no existing localStorage)
        { config: { targetLang: 'zh-TW', provider: 'google' } },
        { config: { targetLang: 'zh-CN', provider: 'google' } },
        { config: { targetLang: 'en',    provider: 'google' } },
        { config: { targetLang: 'ja',    provider: 'google' } },
    ],

    shelfPanelId: 'translator',         // shared by all instances (1 shelf per template)
    pages: { ... },                     // page-aware textarea binding (unchanged)
    providers: [ ... ],                 // provider types (unchanged)
    configSchema: [                     // includes per-instance fields
        { key: 'targetLang', type: 'select', ... },
        { key: 'provider', type: 'select', ... },
    ],

    async init(ctx) {},                 // Once at boot — cache DOM, inject shelf UI, bind events
    async activate(ctx) {},             // ctx = { page, buttonId, instanceId, instanceConfig }
    async deactivate() {},
    async checkHealth(instanceConfig) {},
    destroy() {},
}
```

#### Instance Data Model (persisted in localStorage)

```js
{
    instanceId: 'i_translate_1',     // unique: 'i_' + templateId + '_' + Date.now()
    templateId: 'translate',
    enabled: true,
    order: 0,                        // global ordering, determines button position
    config: { targetLang: 'zh-TW', provider: 'google' }
}
```

- **`mod-instances`** — JSON array of instance objects, ordered by `order`
- **`mod-shared-configs`** — kept for LLM shared config (unchanged)
- **Migration chain:** v1 (8 translate MODs) → v2 (1 translate MOD) → v3 (instances array)

#### Config Schema Field Types

| type | Renders | Use case |
|------|---------|----------|
| `select` | `<select>` dropdown (CRT-themed) | Provider, model, language |
| `text` | `<input type="text">` | API key, custom URL |
| `range` | `<input type="range">` with value display | Temperature, max tokens |
| `toggle` | On/Off pill button | Sub-feature switch |
| `info` | Read-only `<span>` | Server status, download progress |
| `action` | `<button>` | Download model, test connection |

Each field supports `showWhen: { key, value }` — only rendered when another config key matches. Re-evaluated on `mods:configChanged`.

#### Instance Occupies 4 UI Positions

| Position | What | Who builds it |
|----------|------|---------------|
| 1. **List page** | Item in active instances list | Framework (from instance + template metadata) |
| 2. **Config page** | Config panel fields + actions (UP/DOWN/DELETE) | Framework (from `configSchema` + instance management) |
| 3. **Feature button** | Button icon in HUD bar | Framework creates `<button>` with `data-instance-id`, icon via CSS `::after` |
| 4. **Shelf panel** | Panel content when button clicked | **Template** fills HTML in `init()` (shared across instances) |

#### State (`mod-state.js`)

Instance-based state management. Templates are registered, instances are CRUD-managed.

**Template management:**
- `ModState.registerTemplate(id, def)` / `getTemplate(id)` / `getAllTemplates()`

**Instance CRUD:**
- `getInstances()` / `getInstancesByTemplate(templateId)` / `getInstance(instanceId)`
- `addInstance(templateId, config?)` — dispatches `mods:instanceAdded`
- `removeInstance(instanceId)` — dispatches `mods:instanceRemoved` (blocked for singletons)
- `ensureDefaultInstances(templateId)` — creates default instances on first run

**Instance state:**
- `isEnabled(instanceId)` / `setEnabled(instanceId, bool)` — dispatches `mods:changed`
- `getConfig(instanceId, key)` / `setConfig(instanceId, key, value)` — dispatches `mods:configChanged`
- `reorderInstance(instanceId, direction)` — dispatches `mods:reordered`

**Server health:** `getServerStatus(instanceId)` / `refreshServerStatus(instanceId)` / `refreshAllServerStatuses()`

**Shared config (unchanged):** `getSharedConfig(group, key)` / `setSharedConfig(group, key, value)`

#### Manager UI (`mods-manager.js`)

**List page (two containers):**
- **Template catalog** (top): one row per template with [ADD] button. Singletons with existing instance show "ADDED" label.
- **Active instances** (bottom): InfiniteList ordered by `order`. Toggle buttons per instance. Selecting shows config.

**Config page:**
- Instance name + template description
- Config fields from `configSchema`
- Instance management: [▲ UP] [▼ DOWN] [DELETE] action buttons
- DELETE uses MultiStepButton confirm pattern; hidden for singletons
- Config changes update button icon via `updateInstanceButton()`

**Events handled:**
- `mods:instanceAdded` / `mods:instanceRemoved` / `mods:reordered` → re-render list + buttons
- `mods:configChanged` → re-render config fields (showWhen) + update button `data-feature-btn`
- Toggle buttons use `e.stopPropagation()` to avoid triggering InfiniteList click
- `list:selectionChanged` listener MUST check `container.contains(detail.item)` to filter events from other lists

#### Feature Shelf (`feature-shelf.js`)

- **Dynamic DOM queries** — `getFeatureBtns()` / `getFeatureShelves()` re-query each call (buttons created at runtime)
- **Event delegation** on `.feature-container` for click handling
- `isFeatureBtnAllowed($btn)`: reads `data-instance-id`, checks `ModState.isEnabled(instanceId)`
- `resolveShelfId($btn)`: reads `data-instance-id`, looks up template's `shelfPanelId`
- `handleFeatureBtnClick()`: reads instance + template, calls `template.activate({ page, buttonId, instanceId, instanceConfig })` BEFORE shelf panel check
- `updateFeatureButtons(page)`: page's `data-feature-mods` lists template IDs; show buttons for enabled instances of those templates

#### Current Templates (3 self-contained)

| ID | Group | Singleton | Default Instances | Providers | Shelf |
|----|-------|-----------|------------------|-----------|-------|
| `translate` | linguistics | false | 4 (zh-TW, zh-CN, en, ja) | google (cloud), libretranslate (server) | `translator` |
| `speech-to-text` | linguistics | true | 1 | google-speech (cloud) | none |
| `markdown-preview` | utilities | true | 1 | marked (client) | `markdown-preview` |

#### Adding a New Template

1. Create `mods/{id}/mod.js` exporting the template interface (with `getButtonDataId`, `getInstanceName`, `defaultInstances`)
2. Create `mods/{id}/locales/{en,zh-TW,default}.json` with template-local i18n keys
3. Add `export { default as myMod } from './{id}/mod.js'` to `mod-manifest.js`
4. Add CSS icon for feature button: `.feature-btn[data-feature-btn="{btn-id}"]::after { mask-image: url(...) }`
5. Add template ID to `data-feature-mods` on relevant pages in `index.html`
6. **Bump SW cache version** in `sw.js` (required when `index.html` structure changes)

#### SW Cache Bump Reminder

When modifying `index.html` or adding new template files, **always bump the `CACHE_NAME` in `sw.js`**. Stale SW cache serving old `index.html` is a common cause of "all extensions gone" after refactoring.

## MCP Servers

Setup commands (run from project directory, NOT inside Claude Code):
```bash
cd /c/xampp/htdocs/My/\!My_CLI_Re

# Context7 — real-time library documentation
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest

# dbhub — direct PostgreSQL access
claude mcp add my-db -- npx -y @bytebase/dbhub --dsn "postgresql://yu:prejudice720917q@localhost:5431/my-cli-db"
```
Restart Claude Code session after adding. MCP tools appear automatically.

## Custom Audit Agents (`.claude/agents/`)

| Agent | File | Purpose | When to Use |
|-------|------|---------|-------------|
| **css-auditor** | `css-auditor.md` | CRT theme consistency, flex layout, dark/light mode, CSS var usage | After CSS changes |
| **i18n-checker** | `i18n-checker.md` | Locale key parity, hardcoded strings, interpolation consistency | After adding UI text |
| **event-flow-tracer** | `event-flow-tracer.md` | Race conditions, orphaned events, listener isolation, payload consistency | After changing event dispatch/listener code |

Invoke via `general-purpose` subagent with the agent's instructions embedded in the prompt (`.claude/agents/` is gitignored — agents are local tooling, not checked in).

## Platform-Specific Workarounds

### iOS WebKit (`writing-mode: sideways-lr` bug)
iOS WebKit renders `sideways-lr` as CW instead of CCW. Fix in `page-blackboard-log.css`:
```css
@supports (-webkit-touch-callout: none) {
    .head-indicator {
        writing-mode: vertical-rl;
        scale: -1 -1;  /* CW + double-flip = CCW */
        /* borders must also be flipped to compensate */
    }
}
```
The CSS `scale` individual property is NOT overridden by JS `style.transform`. However, `scale: -1 -1` reverses the X axis, so `navi.js` detects iOS and uses `translateX(+256%)` (instead of `-256%`) to hide the element to the left.

### iOS detection pattern (JS)
```javascript
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
```

### Mobile audio
`audio.js` skips playback on mobile devices (autoplay restrictions) via UA sniffing.

## Host Machine

Development & deployment on the same local machine:
- **CPU:** Intel Core i7-13th Gen
- **GPU:** NVIDIA RTX 4080 (capable of running Whisper large-v3, Llama 3 8B+, Stable Diffusion)
- **RAM:** 64 GB
- **OS:** Windows 11
- **Docker Desktop** runs all containers locally
- **Cloudflare Tunnel** exposes the stack publicly

This hardware enables running LOCAL AI models (translation, STT, LLM) in Docker with acceptable performance. The MOD system's provider architecture (`cloud`/`server`/`client` types) is designed to leverage this — each MOD can offer multiple providers and the user selects via config.

## Environment Variables

Copy `.env.example` to `.env`. Required external keys (obtain from team lead):
- `GG_API` — Google Cloud API key (required for translation & speech features)
- `CLOUDFLARED_TOKEN` — Cloudflare tunnel token
- Mail credentials (`GG_SMTP_KEY`, `MAIL_*`) for password reset emails
