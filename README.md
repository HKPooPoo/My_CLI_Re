# My CLI (My Clean Logging Interface)

**Live:** https://my-cli.uk | **Version:** 0.9.0 | **MOD API:** v1

An offline-first, privacy-first personal terminal web application. Write versioned text logs, communicate peer-to-peer in real-time, broadcast to public channels, and extend functionality through a modular plugin (MOD) system with built-in AI support — all from a browser, with no install and no mandatory account.

---

## Highlights

### Unified Board Model

Every feature shares one data primitive: a **Board** — a timestamped timeline of text entries with optional file attachments. Three visibility scopes cover all use cases:

| Scope | Feature | Access |
|-------|---------|--------|
| **SELF** | Blackboard | Private, single-user |
| **PAIR** | Walkie-Typie | Two-user, bidirectional |
| **PUBLIC** | Broadcast | One-to-many, owner-writes |

Operations are consistent across all scopes: PUSH (newer entry), PULL (older entry), branch, fork, commit (upload), checkout (download).

### Local-First Architecture

Primary storage is **IndexedDB** in the browser. The PostgreSQL server is a backup you opt into via explicit COMMIT/CHECKOUT operations. The app works fully offline after first load — all Blackboard features function without internet, without login, without any server at all.

### Branching Timelines

Each Board supports multiple independent **branches** — flat, chronological timelines that can be created, switched (checkout), duplicated (fork), synced (commit), or deleted (drop). No other mainstream note-taking tool offers branching text history with fork semantics.

### Real-Time Communication

Walkie-Typie provides **keystroke-level real-time text streaming** via WebSocket whisper events (50ms debounce, no server persistence). A separate 2-second debounce commits text to PostgreSQL for persistence. Partners see each other's boards as split-screen paired textareas with independent history navigation.

### Multi-Device Sync

With auto-sync enabled, branches committed on one device propagate to all other devices via WebSocket events. Last-write-wins conflict resolution. No manual refresh required.

### MOD System (Plugin Architecture)

A full instance-based plugin framework. Templates are blueprints; users create independent instances with per-instance configuration. Each instance manifests as a feature button on relevant pages with a slide-out panel.

**9 official templates** across 6 groups:

| Template | Group | Description |
|----------|-------|-------------|
| `llm` | llm | AI text processing — client (WebGPU), server (Ollama), or cloud API |
| `llm-bb` | llm | Blackboard-specific AI processing |
| `llm-bc` | llm | Broadcast-specific AI processing |
| `translate` | linguistics | One-click translation via Google Cloud API |
| `speech-to-text` | linguistics | Microphone transcription via Google Speech API |
| `markdown-preview` | utilities | Live Markdown rendering (client-side, `marked` library) |
| `light-theme` | theme | Alternative high-contrast light visual mode |
| `info-screensaver` | screensaver | Informational screen saver overlay |
| `ascii-animator` | decoration | ASCII art animation display |

The MOD API exposes 9 namespaces with 56+ methods: `ctx.instance`, `ctx.board`, `ctx.ui`, `ctx.storage`, `ctx.net`, `ctx.file`, `ctx.events`, `ctx.hooks`, `ctx.query`.

### In-Browser AI (Zero Server Dependency)

The LLM MOD runs **Qwen3 models (0.6B / 1.7B / 4B) directly in the browser via WebGPU** using WebLLM. No API key, no server, no internet required after model download. Text never leaves the device. Three provider options:

| Provider | Runs on | Privacy | Requirement |
|----------|---------|---------|-------------|
| CLIENT | Browser (WebGPU) | Full — text stays on device | Modern GPU, Chrome/Edge |
| SERVER | Local Ollama | Network-local | Self-hosted Ollama |
| API KEY | OpenAI / Anthropic cloud | Cloud provider terms | API key |

Configurable per instance: prompt, target scope (current text / full branch / all branches / dialogue / channel history), model, temperature.

### Cross-MOD Tool System

MODs can register tools using an OpenAI function-calling compatible schema (`ModTools`). Other MODs or future AI agent loops can invoke these tools programmatically. The Translate MOD registers `translate_text` as a callable tool.

### Hook Pipeline

`ModHooks` provides a priority-ordered async pipeline. Handlers registered by MODs execute in priority order with cancellation support. Designed for future instrumentation points (`board:beforeCommit`, `record:textChanged`, etc.).

### Progressive Web App

Full PWA with `standalone` display mode, installable to home screen / desktop. Service Worker implements stale-while-revalidate caching for 53 pre-cached assets. `/api/` routes bypass the cache entirely. Silent update mechanism: detect new SW → toast notification → `SKIP_WAITING` → seamless takeover.

### Internationalization

Complete bilingual support (English + Traditional Chinese, ~195 platform strings + MOD-local strings). JS API: `t('section.key')`. HTML attributes: `data-i18n`, `data-i18n-placeholder`. MODs provide their own locale files merged at boot via `mergeStrings()`.

### File Attachments

Drag-and-drop file attachments up to 1GB per file. Lifecycle: `staged` → `committed` → `orphaned` (auto-cleaned after 24h). File status chips show LOCAL / SYNC / CLOUD state. Nginx streams uploads with request buffering disabled and a 1-hour timeout.

### Multi-Step Confirmation Pattern

Destructive operations (DROP, DELETE, CUT, CLEAN) use a two-click confirmation: first click arms the button (visual change + label swap), second click executes. Auto-resets after 3 seconds. Async operations prevent double-fire via `aria-busy`.

---

## Architecture

### Docker Services (12)

```
nginx ─── Static SPA + reverse proxy (port 80)
api ───── Laravel 12 PHP-FPM (internal port 9000)
reverb ── WebSocket server (internal port 8081)
queue ─── Background job worker (queue:listen)
scheduler  Cron-based scheduled tasks
db ─────── PostgreSQL 16 (port 5431)
redis ──── Session, cache, queue broker
pgadmin ── Database admin UI (port 8080)
mailpit ── Email testing (port 8025)
tunnel ─── Cloudflare Tunnel (public HTTPS access)
ollama ───────── Self-hosted LLM server (profile: mods, GPU-enabled, port 11434)
```

5 named volumes: `db-data`, `pgadmin-data`, `redis-data`, `file-storage`, `ollama-data`

### Backend (Laravel 12)

**Pattern:** Thin controllers validate input → delegate to Service → return JSON.

| Controllers | Services | Events | Mailables | Migrations | API Routes |
|-------------|----------|--------|-----------|------------|------------|
| 11 | 6 | 5 | 2 | 10 | 38 |

**Rate limiting tiers:** AI endpoints (10/min) · Writes/auth (30/min) · File reads (60/min) · Public reads (120/min)

**Models:** `User`, `File` only. Board data stored in feature-specific tables (blackboards, walkie_typie_boards, broadcast_boards).

**Real-time events (5):**

| Event | Channel | Trigger |
|-------|---------|---------|
| `BlackboardUpdated` | Private user channel | Branch committed from another device |
| `BroadcastChannelUpdated` | Public channel | Channel content updated |
| `WalkieTypieConnectionUpdated` | Private user channel | Connection added/removed |
| `WalkieTypieContentUpdated` | Private user channel | Partner text committed |
| `WalkieTypieSignal` | Private partner channel | Signal ping to partner |

Client-side whisper event (`typing`) on private Walkie-Typie channels — 50ms debounce, no server round-trip.

### Frontend (Vanilla JS SPA)

Zero-framework architecture. Pure HTML + CSS + ES Modules.

| Category | Count |
|----------|-------|
| JavaScript modules | 63 (48 core + 13 services + 5 vendor) |
| CSS files | 21 (1 root + 20 in stylesheets/) |
| MOD templates | 9 (+ 1 skeleton) |
| Locale files | 2 platform (en, zh-TW) + per-MOD locales |
| Audio files | 10 |
| Pre-cached assets | 53 |

**Vendor dependencies (bundled, no build step):**
- `dexie.js` — IndexedDB wrapper
- `echo.iife.js` + `pusher.min.js` — Laravel Echo WebSocket client
- `marked.min.js` — Markdown parser
- `textmode.js` — Text rendering utility

**Event-driven architecture:** 25+ custom events coordinating between modules (`auth:updated`, `navi:pageChanged`, `list:selectionChanged`, `mods:loaded`, `settings:changed`, etc.). Modules communicate exclusively via `window.dispatchEvent` — no shared mutable state.

### Database Schema (10 tables)

```
users (uid, passcode, title, email, settings JSONB)
  ├── blackboards (branch_id, branch_name, timestamp, text, file_hash)
  ├── walkie_typie_connections (partner_id, partner_tag, branch IDs, last_signal)
  ├── walkie_typie_boards (branch_id, branch_name, timestamp, text, file_hash)
  ├── broadcast_channels (name, last_signal)
  │     ├── broadcast_boards (timestamp, text, file_hash)
  │     └── broadcast_pins (user_id)
  └── files (hash, original_name, mime_type, size, disk_path, status)
```

`file_hash` is `text` type (supports JSON array serialization for multi-file attachments).

### Nginx Routing

| Location | Behavior |
|----------|----------|
| `/` | Static frontend, SPA fallback (`try_files → index.html`) |
| `/api/files` | FastCGI, streaming mode (buffering off), 1-hour timeout |
| `/api/mods/llm/chat/stream` | FastCGI, SSE mode (buffering off), 5-min timeout |
| `/api/*` | FastCGI, standard settings |
| `/app` | WebSocket proxy to Reverb (HTTP/1.1 upgrade) |

### MOD System Internals

**Boot sequence:** `i18n:ready` → validate templates → register in ModState → wire context factory → run migration → fetch MOD locales → create DOM → register tools + hooks → call `template.init(ctx)` → dispatch `mods:loaded`

**Core modules:**

| Module | Role |
|--------|------|
| `mod-manifest.js` | Static template export list (single source of truth) |
| `mod-loader.js` | Import, validate, register, DOM creation, lifecycle management |
| `mod-state.js` | Instance CRUD, persistence (localStorage), event dispatch |
| `mod-context.js` | Sandboxed API factory (9 namespaces, 56+ methods) |
| `mod-board-provider.js` | Board data access abstraction |
| `mod-field-registry.js` | Config field type registry (select, text, range, toggle, info, action, + custom) |
| `mod-hooks.js` | Priority-ordered async pipeline (register/run/cancel) |
| `mod-tools.js` | Cross-MOD tool registry (OpenAI function-calling schema) |
| `mods-manager.js` | UI for template catalog + instance list + config page |
| `feature-shelf.js` | Slide-out panel management, button visibility per page |

**ADD/DELETE model:** Instance existence = enabled. No on/off toggle. Delete to disable, add to enable.

---

## Development Setup

### Prerequisites

- Docker Desktop
- Git

### First-Time Setup

```bash
# 1. Clone
git clone <repository-url>
cd My_CLI_Re

# 2. Environment — copy template and fill in credentials
cp .env.example .env
# Optional: fill in GG_API (Google Cloud), CLOUDFLARED_TOKEN, MAIL_* credentials

# 3. Build and start (core services only — ~2 min first time for composer install)
docker compose up -d --build nginx api db redis

# 4. Generate APP_KEY — copy the output into .env
docker exec my-cli-api php artisan key:generate --force --show
# Paste the base64:... output as the APP_KEY value in .env

# 5. Restart API to pick up the new key, then run migrations
docker compose up -d api
docker exec my-cli-api php artisan migrate --force

# 6. (Optional) Start MOD services (Ollama)
docker compose --profile mods up -d
```

> **Note:** The entrypoint script auto-installs Composer dependencies on first boot
> when `vendor/` is missing. No manual `composer install` needed.
>
> **Full stack:** To start all services (including queue, scheduler, reverb, pgadmin,
> mailpit, tunnel), run `docker compose up -d --build` instead of step 3.

### Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| API | http://localhost/api |
| API Status | http://localhost/api/status |
| PgAdmin | http://localhost:8080 |
| Mailpit | http://localhost:8025 |
| WebSocket (Reverb) | ws://localhost:8081 |
| PostgreSQL | localhost:5431 |
| Ollama (with mods profile) | http://localhost:11434 |

### Common Commands

```bash
docker compose up -d --build           # Rebuild and start
docker compose down                     # Stop all services
docker compose --profile mods up -d     # Start optional MOD services
docker compose logs -f api              # Tail API logs

docker exec my-cli-api php artisan migrate              # Run migrations
docker exec my-cli-api php artisan migrate:fresh --seed  # Reset DB
docker exec my-cli-api php artisan test                  # Run all tests
docker exec my-cli-api php artisan test --filter TestName # Single test
docker exec my-cli-api ./vendor/bin/pint                 # Lint PHP
```

### Development Workflow

- **Frontend:** Edit files in `frontend/`. Refresh browser. No build step.
- **Backend:** Edit files in `backend/app/`. Changes reflect immediately. Run `php artisan config:clear` if cached.
- **Database:** Persisted in `db-data` volume. Use PgAdmin or MCP database tool for inspection.
- **Service Worker:** Bump `CACHE_NAME` in `frontend/sw.js` when modifying `index.html` or adding new files.

---

## Project Structure

```
!My_CLI_Re/
├── backend/                    # Laravel 12
│   ├── app/
│   │   ├── Http/Controllers/   # 11 controllers
│   │   ├── Services/           # 6 service classes
│   │   ├── Events/             # 5 broadcast events
│   │   ├── Mail/               # 2 mailables
│   │   └── Models/             # User, File
│   ├── database/migrations/    # 10 migrations
│   ├── routes/api.php          # 38 API routes
│   └── Dockerfile
├── frontend/                   # Vanilla JS SPA
│   ├── index.html              # Single entry point
│   ├── style.css               # Root stylesheet
│   ├── sw.js                   # Service Worker (53 cached assets)
│   ├── manifest.json           # PWA manifest
│   ├── javascript/             # 48 ES modules
│   │   ├── services/           # 13 API service abstractions
│   │   └── vendor/             # 5 bundled libraries
│   ├── mods/                   # MOD system
│   │   ├── mod-manifest.js     # Template registry
│   │   ├── _template/          # Skeleton for new MODs
│   │   ├── llm/                # AI text processing (WebGPU/Ollama/Cloud)
│   │   ├── llm-bb/             # Blackboard AI
│   │   ├── llm-bc/             # Broadcast AI
│   │   ├── translate/          # Translation
│   │   ├── speech-to-text/     # Voice input
│   │   ├── markdown-preview/   # Markdown rendering
│   │   ├── light-theme/        # Theme toggle
│   │   ├── info-screensaver/   # Screen saver
│   │   └── ascii-animator/     # ASCII art
│   ├── stylesheets/            # 20 CSS files
│   ├── locales/                # en.json, zh-TW.json (~195 strings)
│   ├── images/                 # Icons, banners
│   └── audio/                  # 10 sound effects
├── docker/
│   ├── entrypoint.sh           # Auto composer install + optional setup
│   └── nginx/default.conf      # Reverse proxy config
├── docker-compose.yml          # 12 services, 5 volumes
├── .gitattributes              # Force LF for shell scripts
├── documents/                  # Design docs, proposals
└── .env.example                # Environment template
```

---

## Environment Variables

Set in root `.env`, injected via `docker-compose.yml`:

| Variable | Purpose | Required |
|----------|---------|----------|
| `GG_API` | Google Cloud API key (translation, speech) | For translate/STT MODs |
| `CLOUDFLARED_TOKEN` | Cloudflare Tunnel token | For public HTTPS access |
| `MAIL_*` | Laravel mail configuration | For password reset emails |
| `DB_*` | PostgreSQL connection settings | Yes (defaults in .env.example) |
| `REDIS_*` | Redis connection settings | Yes (defaults in .env.example) |
| `REVERB_*` | WebSocket server settings | Yes (defaults in .env.example) |

## Security

- **Never** commit `.env` or any file containing API keys / passwords
- No PII required for registration — UID + passcode only, no email / phone mandatory
- Rate limiting on all API endpoints (10–120 req/min tiered)
- File uploads validated by mime type, orphaned files auto-cleaned after 24h
- CSRF protection via Laravel Sanctum
- Local-first storage: sensitive data stays in browser IndexedDB by default
