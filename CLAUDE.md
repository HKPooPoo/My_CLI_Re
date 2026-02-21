# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Real-Time (WebSocket) Flow
1. `echo-service.js` creates a single Laravel Echo instance connecting to Reverb
2. `walkie-typie-core.js` subscribes to private channels (`private-walkie-typie.{uid}`)
3. Broadcast channels use public channels (`broadcast-channel.{channelId}`)
4. Backend fires events (e.g., `BroadcastChannelUpdated`) which Reverb pushes to subscribers
5. Frontend listeners dispatch custom DOM events to update the UI

### Nginx Routing (key rules)
- `/api/files` — upload streaming with request buffering disabled, 3600s timeout
- `/app` — proxied to Reverb WebSocket
- Everything else under `/api` — PHP-FPM FastCGI
- All other paths — `index.html` (SPA fallback)

## Environment Variables

Copy `.env.example` to `.env`. Required external keys (obtain from team lead):
- `GG_API` — Google Cloud API key (required for translation & speech features)
- `CLOUDFLARED_TOKEN` — Cloudflare tunnel token
- Mail credentials (`GG_SMTP_KEY`, `MAIL_*`) for password reset emails
