# Restaurant Module — Design Spec

> Last verified: 2026-03-19
> Brand: 臺味冰點 (Taiwan Ice Station)
> Mode: Delivery ONLY (no dine-in, no takeaway)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        Nginx                                  │
│  /pages/restaurant/{BRANCH}/menu/     → menu/index.html       │
│  /pages/restaurant/{BRANCH}/kitchen/  → kitchen/index.html    │
│  /pages/restaurant/{BRANCH}/deliverer/→ deliverer/index.html  │
│  /api/restaurant/*                    → Laravel PHP-FPM       │
│  ws://localhost:8081                  → Laravel Reverb         │
└──────────────────────────────────────────────────────────────┘
         │                      │                     │
    ┌────▼────┐           ┌─────▼─────┐         ┌────▼────┐
    │ Customer │           │  Kitchen  │         │Deliverer│
    │  (menu)  │           │ (kitchen) │         │(deliver)│
    └────┬────┘           └─────┬─────┘         └────┬────┘
         │                      │                     │
    IndexedDB              PostgreSQL only       PostgreSQL only
    + API POST             (restaurant conn)     (restaurant conn)
    + API poll
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single server, multi-branch via URL path | One domain, branches distinguished by `/TM01/`, `/TSW01/` etc. |
| Customer uses IndexedDB + API | Local history for offline, API for kitchen visibility |
| Kitchen & Deliverer use API only | No local state — always reads from PostgreSQL |
| Items as JSON column (not table) | Simpler writes, atomic order snapshot, no join overhead |
| Separate PostgreSQL DB (`postgres`) | Fully isolated from MyCLI DB (`my-cli-db`) |
| Pickup code = order_number | `{BRANCH}{2-digit seq}-{4-char rand}`, daily reset |
| Server-side deliverer sessions | 64-char hex token in DB, sent as `X-Deliverer-Token` header |
| 2-second polling fallback | All API-backed pages poll as reliable fallback to WebSocket |

---

## 2. File Inventory

### 2.1 Frontend Entry Points (3 HTML pages)

| File | Interface | Login Gate | IndexedDB | Navi Structure |
|------|-----------|-----------|-----------|----------------|
| `menu/index.html` | Customer | None | Yes (cart, orders) | Order (menu/cart/history) · Console (dev-tools) |
| `kitchen/index.html` | Kitchen | Password (branch from URL) | No | Kitchen (orders/history/menu) · Deliverer (list/register) · Console (dev-tools) |
| `deliverer/index.html` | Deliverer | Phone + password | No | Delivery (scan/task/history) |

Also: `index.html` — redirect to `menu/`

### 2.2 Frontend JS Modules (20 files)

#### Core (6)
| File | Purpose | Used By |
|------|---------|---------|
| `i18n.js` | Locale loading, `t()`, `localize()`, `setLocale()` | All 3 interfaces |
| `branch.js` | Extract branch from URL path → `BRANCH` constant | Kitchen, Cart |
| `restaurant-api.js` | HTTP client, auto-attaches `X-Deliverer-Token` | All 3 interfaces |
| `restaurant-echo.js` | WebSocket via Reverb, dispatches CustomEvents | Kitchen, Deliverer |
| `db.js` | Dexie IndexedDB v4: `cartItems`, `orders` | Customer only |
| `order-store.js` | IDB order CRUD, localStorage helpers, delivery info | Customer only |

#### Customer Pages (5)
| File | Page | Storage | Polling |
|------|------|---------|---------|
| `menu.js` | Menu browsing + add to cart + search | localStorage (unavailable) | No |
| `cart.js` | Cart state machine (in-memory + IDB) | IndexedDB | No |
| `cart-page.js` | Cart display + checkout form + armed confirm | IDB write → API POST | No |
| `history-page.js` | Order history + live status polling | IDB read → API poll | 2s |
| `console-page.js` | Dev tools: test items, clear data, printed orders | IDB + API | Events |

#### Kitchen Pages (7)
| File | Page | Polling |
|------|------|---------|
| `kitchen-login.js` | Password login (branch from URL) | No |
| `kitchen-page.js` | Pending orders + "Print" button | 2s |
| `kitchen-history-page.js` | Non-pending orders history | 2s |
| `kitchen-menu-page.js` | Toggle item availability (localStorage) | No |
| `kitchen-deliverer-page.js` | Deliverer list + armed delete | 2s |
| `kitchen-register-page.js` | Register deliverer (name/phone/password) | No |
| `kitchen-console-page.js` | Session bar + printed orders list + logout | 2s |

#### Deliverer Pages (4)
| File | Page | Polling |
|------|------|---------|
| `delivery-login.js` | Phone + password login | No |
| `delivery-page.js` | Mock scan + manual pickup code entry + claim | No |
| `delivery-task-page.js` | Active deliveries + mark delivered | 2s |
| `delivery-history-page.js` | Completed deliveries | 2s |

#### Utility (1)
| File | Purpose |
|------|---------|
| `lang-toggle.js` | Toggle zh-TW ↔ en, reload page |

#### ORPHANED (1)
| File | Status | Note |
|------|--------|------|
| `app.js` | **NOT IMPORTED** by any HTML | Legacy entry point from before 3-page split. All 3 HTMLs use inline `<script>` instead. Safe to delete. |

### 2.3 Frontend Assets

| Type | Files |
|------|-------|
| CSS | `css/style.css` (1086 lines) |
| Locales | `locales/en.json` (143 keys), `locales/zh-TW.json` (143 keys) — fully paired |
| Images | `images/header.png`, `images/background.png` |

### 2.4 Backend (8 PHP files)

| Layer | File | Class |
|-------|------|-------|
| Controller | `RestaurantOrderController.php` | 6 methods: index, store, show, showByPickupCode, updateStatus, listByDeliverer |
| Controller | `RestaurantBranchController.php` | 3 methods: index, store, authenticate |
| Controller | `RestaurantDelivererController.php` | 7 methods: index, store, authenticate, logout, me, updateStatus, destroy |
| Service | `RestaurantOrderService.php` | createOrder, getOrder, listTodayOrders, updateStatus, listByDeliverer, generateOrderNumber |
| Service | `RestaurantBranchService.php` | createBranch, listBranches, findByCode, authenticate |
| Service | `RestaurantDelivererService.php` | register, authenticate, validateSession, logout, list, updateStatus, delete |
| Event | `RestaurantOrderUpdated.php` | ShouldBroadcastNow on `restaurant-orders[.{branchCode}]` |
| Mail | `RestaurantReceiptMail.php` | Queued receipt email when customer_email provided |

### 2.5 Database (restaurant connection → `postgres` DB)

#### Active Tables (3)
| Table | Key Columns | Notes |
|-------|-------------|-------|
| `branches` | id, code (unique), name, password (bcrypt) | Seeded: TM01/tm1234, TSW01/tsw1234 |
| `orders` | id, order_number (unique), status, total, items (JSON), branch_id FK, delivery_*, customer_*, deliverer_id FK, comment, customer_email, estimated_minutes, printed_at, delivered_at | Status: pending→printed→delivering→delivered |
| `deliverers` | id, name, phone (unique), password (bcrypt), status, session_token (unique) | Status: idle/delivering/offline |

#### Dead Tables (3) — created by migrations but unused
| Table | Why Dead | Action |
|-------|----------|--------|
| `order_items` | Items stored as JSON in `orders.items` instead | Can drop via migration |
| `restaurant_sessions` | Dine-in feature removed | Can drop via migration |
| `menu_items` | Menu is hardcoded in HTML `data-*` attributes | Future: dynamic menu from DB |

#### Dead Columns (2)
| Table.Column | Why Dead |
|--------------|----------|
| `orders.qr_token` | Pickup code = `order_number`, never populated |
| `orders.table_number` | Dine-in removed |
| `orders.session_token` | Dine-in removed |

### 2.6 Migrations (6 files in `database/migrations/restaurant/`)

| Migration | Purpose |
|-----------|---------|
| `2026_03_06_192814_create_restaurant_tables` | menu_items, orders, order_items |
| `2026_03_07_000001_add_branches_sessions` | branches, restaurant_sessions, branch_id/table_number on orders |
| `2026_03_19_000001_add_deliverers_and_delivery_fields` | deliverers table, delivery columns on orders |
| `2026_03_19_000002_add_comment_to_orders` | comment column |
| `2026_03_19_000003_add_email_to_orders` | customer_email column |
| `2026_03_19_000004_add_password_to_branches` | password on branches, seed TM01/TSW01 |

### 2.7 API Routes (11 endpoints under `/api/restaurant`)

```
GET    /branches                       → list branches
POST   /branches                       → create branch
POST   /branches/auth                  → kitchen login (code + password)

GET    /orders?branch={code}            → today's orders (status-sorted)
POST   /orders                         → create order (items, delivery info)
GET    /orders/pickup/{code}            → find by pickup code
GET    /orders/deliverer/{delivererId}  → orders for deliverer
GET    /orders/{orderNumber}            → single order detail
PATCH  /orders/{orderNumber}/status     → update status + deliverer_id

GET    /deliverers                     → list all
POST   /deliverers                     → register (name, phone, password)
POST   /deliverers/auth               → login (phone + password → session_token)
POST   /deliverers/logout             → clear session_token
GET    /deliverers/me                  → validate token
PATCH  /deliverers/{id}/status         → update status
DELETE /deliverers/{id}                → remove deliverer
```

**Auth: NONE** — all routes publicly accessible (no middleware).

---

## 3. Data Flow

### 3.1 Order Lifecycle

```
Customer                    Kitchen                     Deliverer
   │                          │                            │
   ├─ POST /orders ──────────►│ status: pending            │
   │  (IDB + API)             │                            │
   │                          ├─ PATCH status: printed     │
   │  poll: "準備中"           │  → "等待外送員接單中"       │
   │                          │                            │
   │                          │          ◄── GET /pickup/{code}
   │                          │          ◄── PATCH status: delivering
   │  poll: "已結單"           │                            │
   │                          │          ◄── PATCH status: delivered
   │                          │                            │
```

### 3.2 Storage Boundaries

| Store | Interface | What |
|-------|-----------|------|
| IndexedDB `cartItems` | Customer | Active cart items |
| IndexedDB `orders` | Customer | Local order history + apiOrderNumber for polling |
| localStorage `delivery-info` | Customer | Saved delivery form fields |
| localStorage `menu-unavailable` | Customer + Kitchen | Item availability toggles |
| localStorage `kitchen-session` | Kitchen | `{ id, code, name }` |
| localStorage `deliverer-session` | Deliverer | `{ id, phone, name, token }` |
| localStorage `locale` | All | `"zh-TW"` or `"en"` |
| PostgreSQL `orders` | Kitchen + Deliverer | Source of truth for status |
| PostgreSQL `deliverers` | Kitchen + Deliverer | Registration + session tokens |
| Redis cache | Backend | `restaurant:deliverers` (30s TTL), order sequence locks |

### 3.3 WebSocket Events

| Event | Channel | Trigger | Listeners |
|-------|---------|---------|-----------|
| `restaurant.order.updated` (action: created) | `restaurant-orders.{branch}` | Order created with branch_code | Kitchen pages |
| `restaurant.order.updated` (action: status_changed) | `restaurant-orders.{branch}` | Status updated (branch order) | Kitchen pages |
| `restaurant.order.updated` (action: created) | `restaurant-orders` | Order created without branch_code | Customer/Deliverer |

**Known gap:** Orders WITH branch_code only broadcast to branch channel. Customer pages listening on global channel won't receive these events. Mitigated by 2s polling.

### 3.4 Custom DOM Events

| Event | Emitter | Listeners |
|-------|---------|-----------|
| `cart:updated` | cart.js | cart-page.js (re-render + badge shake) |
| `order:created` | order-store.js | history-page.js, console-page.js |
| `order:statusChanged` | order-store.js | history-page.js, console-page.js |
| `menu:availabilityChanged` | order-store.js | menu.js, kitchen-menu-page.js |
| `restaurant:orderCreated` | restaurant-echo.js | kitchen-page.js, console-page.js |
| `restaurant:orderUpdated` | restaurant-echo.js | all kitchen pages, delivery pages, console |

---

## 4. Known Issues (Open)

| ID | Severity | Description |
|----|----------|-------------|
| **H3** | HIGH | All API routes have zero authentication middleware — destructive endpoints (PATCH status, DELETE deliverer) publicly accessible |
| **M1** | MEDIUM | Kitchen session token saved to localStorage but never sent in API requests — no server-side kitchen auth |
| **M4** | MEDIUM | `listByDeliverer` returns ALL historical orders (no date filter) — potential performance issue |
| **L3** | LOW | Dead DB tables: `order_items`, `restaurant_sessions` — should be dropped |
| **L5** | LOW | `RestaurantReceiptMail` uses deprecated `build()` API vs `envelope()+content()` |
| **WS1** | MEDIUM | WebSocket broadcasts to ONE channel only (branch OR global) — customer never receives branch-scoped events |
| **ORPHAN** | LOW | `app.js` is not imported by any HTML page — dead file |

---

## 5. Menu (Hardcoded in HTML)

| Category | Item | Price | Options |
|----------|------|-------|---------|
| 飯 | 滷肉飯 | $52 | drink (9), topping (5 multi), extra (3 multi) |
| 飯 | 炒飯 | $50 | drink (9), topping (5 multi), extra (2 multi) |
| 麵 | 肥牛炒烏冬 | $55 | drink (9), topping (5 multi), extra (2 multi) |
| 麵 | 肉醬意粉 | $52 | drink (9), topping (5 multi), extra (2 multi) |
| 凍綠茶 | 茉香綠茶 | $18 | topping (5 multi) |
| 凍綠茶 | 金桔綠茶 | $18 | topping (5 multi) |
| 凍綠茶 | 青蘋菓綠茶 | $18 | topping (5 multi) |
| 凍綠茶 | 荔枝綠茶 | $18 | topping (5 multi) |
| 特飲 | 檸檬可樂 | $20 | topping (5 multi) |
| 特飲 | 鴛鴦 | $20 | topping (5 multi) |

Delivery zones: 屯門市中心 (1.5km, free), 屯門北 (3km, $15), 天水圍 (4.5km, $25), 元朗 (6km, out of range).
Minimum order: $50.

---

## 6. Branch System

| Code | Name | Password | Seeded By |
|------|------|----------|-----------|
| TM01 | Tuen Mun | `tm1234` (bcrypt) | Migration `000004` |
| TSW01 | Tin Shui Wai | `tsw1234` (bcrypt) | Migration `000004` |

URL pattern: `/pages/restaurant/{BRANCH_CODE}/menu|kitchen|deliverer/`
Branch extracted by: `branch.js` reads `location.pathname.split('/')[3]`

---

## 7. i18n Keys (143 paired)

Namespaces: `nav.*` (18), `menu.*` (3), `cart.*` (17), `order.*` (12), `kitchen.*` (15), `deliverer.*` (17), `delivery.*` (19), `console.*` (12), `footer.*` (1).

Unused key: `delivery.pick-up` (exists in both locales but never referenced in JS).
