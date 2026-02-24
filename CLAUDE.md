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
  mod-registry.js     # MOD definitions (10 atomic MODs)
  mod-state.js        # MOD state + config persistence
  mods-manager.js     # MOD Manager UI (list + config pages)
  feature-shelf.js    # Feature shelf lateral panel + MOD-aware button visibility
  feature-translator.js  # Translation MOD (per-language provider selection)
  feature-markdown.js    # Markdown preview MOD
  echo-service.js     # Singleton Laravel Echo instance (shared by all modules)
  indexedDB.js        # IndexedDB wrapper for client-side persistence
  audio.js            # Sound effects for UI
  multiStepButton.js  # Reusable multi-step confirmation button component
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
| `mods:changed` | mod-state.js | `{ modId, enabled }` | MOD toggled on/off; feature-shelf re-evaluates button visibility |
| `mods:configChanged` | mod-state.js | `{ modId, key, value }` | MOD config value changed |
| `mods:selected` | mods-manager.js | `{ modId }` | MOD selected in list (500ms debounce); config page renders |
| `settings:maxSlotChanged` | misc.js | — | MAX_SLOT range slider changed; lists adjust limits |

### i18n System (`i18n.js`)

- Locale JSON files at `/locales/{locale}.json` (en, zh-TW, zh-CN)
- Locale stored in `localStorage['locale']`, defaults to `'en'`
- **DOM binding:** `data-i18n="key"` sets `textContent`; `data-i18n-placeholder="key"` sets `placeholder`
- **JS usage:** `t('auth.loginError', { uid })` — dot-notation key lookup with `{var}` interpolation
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

### MOD System (`mod-registry.js`, `mod-state.js`, `mods-manager.js`)

Pluggable feature system. Each MOD = one atomic feature. The 4th main navigation section (`mods`) has two pages: list + config.

**Registry** (`mod-registry.js`): Static definitions for all MODs.
- `MOD_TYPES`: `SERVER` (needs health check) or `CLIENT` (always available)
- Each MOD has: `id`, `nameKey`, `descriptionKey`, `group`, `type`, `featureButtons[]`, `config[]`, `defaultEnabled`
- Groups: `linguistics` (translation + speech-to-text), `utilities` (markdown-preview)
- Multiple MODs can reference the same feature button (e.g. `translate-zh-TW` online + offline); button shows if ANY referencing MOD is enabled

**State** (`mod-state.js`): Persists to `localStorage['mod-states']` and `localStorage['mod-configs']`.
- `ModState.isEnabled(id)` / `setEnabled(id, bool)` — dispatches `mods:changed`
- `ModState.getConfig(id, key)` / `setConfig(id, key, value)` — dispatches `mods:configChanged`
- `refreshAllServerStatuses()` — deduplicates by `healthEndpoint` (one HTTP call per unique endpoint)
- CLIENT MODs always have `serverStatus = 'online'`

**Manager UI** (`mods-manager.js`): List page with InfiniteList + inline toggle buttons + group dividers. Config page with description, server status, and dynamic config form (for future API keys/LLM config).
- Init order matters: `bindEvents()` BEFORE `renderModList()` (InfiniteList fires `list:selectionChanged` on creation)
- Toggle buttons use `e.stopPropagation()` to avoid triggering InfiniteList click
- `list:selectionChanged` listener MUST check `container.contains(detail.item)` to filter events from other lists

**Feature button visibility** (`feature-shelf.js`):
```js
function isFeatureBtnAllowedByMods(btnId) {
    const relatedMods = Object.entries(MOD_REGISTRY)
        .filter(([, def]) => def.featureButtons?.includes(btnId));
    if (relatedMods.length === 0) return true;
    return relatedMods.some(([id]) => ModState.isEnabled(id));
}
```

**Current MODs (10):**
| ID | Group | Type | Feature Button |
|----|-------|------|---------------|
| `translate-{lang}-online` (x4) | linguistics | CLIENT | `translate-{lang}` |
| `translate-{lang}-offline` (x4) | linguistics | SERVER | `translate-{lang}` |
| `speech-to-text` | linguistics | CLIENT | `voice-to-textbox` |
| `markdown-preview` | utilities | CLIENT | `markdown-preview` |

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

This hardware enables running LOCAL AI models (translation, STT, LLM) in Docker with acceptable performance. The MOD system's online/offline provider architecture is designed to leverage this.

## Environment Variables

Copy `.env.example` to `.env`. Required external keys (obtain from team lead):
- `GG_API` — Google Cloud API key (required for translation & speech features)
- `CLOUDFLARED_TOKEN` — Cloudflare tunnel token
- Mail credentials (`GG_SMTP_KEY`, `MAIL_*`) for password reset emails
