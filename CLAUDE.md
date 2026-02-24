# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow (MANDATORY)

**Every task must be wrapped in two commits — one BEFORE changes and one AFTER.**

1. **Before starting work:** Stage and commit all current uncommitted changes with message `WIP: before <short task description>`
2. **After completing work:** Stage and commit all changes with a descriptive message summarising what was done
3. Do NOT push to remote — this repo is local-only
4. Keep commits atomic: one task = one before/after commit pair

## Project Overview

**My CLI Re** is a collaborative, peer-to-peer communication platform with a retro CRT terminal aesthetic. It is a Docker-based full-stack application with a Laravel 12 (PHP-FPM) backend and a vanilla JavaScript frontend served by Nginx.

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
| **Blackboard** | `BlackboardController` | `BlackboardService` | Shared notes with VCS-like branching |
| **Walkie-Typie** | `WalkieTypieController` | `WalkieTypieBoardService` | P2P connections with message boards |
| **Broadcast Channels** | `BroadcastChannelController` | `BroadcastChannelService` | Public channels with Last-Write-Wins |
| **Files** | `FileController` | `FileService` | SHA-256 deduplicated file storage (up to 10GB) |
| **Auth** | `AuthController` | `AuthService` | UID+passcode auth, email binding, `/passwd` & `/bind` commands |

### Database Schema (key tables)
- `users` — uid (unique), passcode, title, email
- `blackboards` — owner, branch_id, branch_name, timestamp, text, bin (file hash)
- `walkie_typie_connections` — user_uid, partner_uid, my_branch_id, partner_branch_id
- `walkie_typie_boards` — owner, branch_id, timestamp, text, bin
- `broadcast_channels` — id, name, owner_uid
- `broadcast_boards` — channel_id, timestamp, text, bin
- `broadcast_pins` — user_uid, channel_id
- `files` — hash, owner_uid, original_name, mime_type, disk_path, status

**File status lifecycle:** `staged` → `committed` → `orphaned` (orphaned files cleaned up after 24h)

### Frontend Structure (`frontend/`)

The frontend is a **multi-section SPA** with no framework — pure HTML, CSS, and ES modules organized by feature.

```
javascript/
  services/           # API/data layer (api.js, auth-service.js, broadcast-service.js, etc.)
  blackboard*.js      # Blackboard feature modules
  walkie-typie*.js    # Walkie-Typie feature modules
  broadcast*.js       # Broadcast Channels feature modules
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

- **Main navi items** (`data-navi-item`): `blackboard`, `walkie-typie`, `broadcast`
- **Sub-navi items** (`data-sub-navi-item`): e.g. blackboard has `blackboard-log`, `blackboard-branch`, `auth`, `blackboard-misc`
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

### Real-Time (WebSocket) Flow
1. `echo-service.js` creates a single Laravel Echo instance connecting to Reverb
2. `walkie-typie-core.js` subscribes to private channels (`private-walkie-typie.{uid}`)
3. Broadcast channels use public channels (`broadcast-channel.{channelId}`)
4. Backend fires events (e.g., `BroadcastChannelUpdated`) which Reverb pushes to subscribers
5. Frontend listeners dispatch custom DOM events to update the UI

### PWA & Service Worker

- **Caching strategy:** Stale-while-revalidate for static assets; `/api/` requests always bypass SW
- **Update flow:** SW `updatefound` → `showUpdateToast()` → posts `SKIP_WAITING` message → new SW takes control silently (no forced reload)
- **Install (A2HS):** `beforeinstallprompt` stored → `pwa:installable` event dispatched → auth.js shows install UI → `window.installPWA()` triggers prompt

### Nginx Routing (key rules)
- `/api/files` — upload streaming with request buffering disabled, 3600s timeout
- `/app` — proxied to Reverb WebSocket
- Everything else under `/api` — PHP-FPM FastCGI
- All other paths — `index.html` (SPA fallback)

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

## Environment Variables

Copy `.env.example` to `.env`. Required external keys (obtain from team lead):
- `GG_API` — Google Cloud API key (required for translation & speech features)
- `CLOUDFLARED_TOKEN` — Cloudflare tunnel token
- Mail credentials (`GG_SMTP_KEY`, `MAIL_*`) for password reset emails
