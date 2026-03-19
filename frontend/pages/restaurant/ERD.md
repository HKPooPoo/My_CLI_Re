# Restaurant Module — ERD

> Last verified: 2026-03-19
> Database: PostgreSQL (`postgres` DB, `restaurant` connection)
> IndexedDB: Dexie v4 (`restaurant` database)

---

## PostgreSQL ERD (Server)

```mermaid
erDiagram
    branches {
        bigint id PK
        varchar code UK "e.g. TM01"
        varchar name "e.g. Tuen Mun"
        varchar password "bcrypt, nullable"
        timestamp created_at
        timestamp updated_at
    }

    deliverers {
        bigint id PK
        varchar name
        varchar phone UK
        varchar password "bcrypt"
        varchar status "idle | delivering | offline"
        varchar session_token UK "64-char hex, nullable"
        timestamp created_at
        timestamp updated_at
    }

    orders {
        bigint id PK
        varchar order_number UK "TM0101-a3f8"
        varchar status "pending | printed | delivering | delivered"
        integer total "grand total incl. delivery fee"
        json items "array of {name, subtotal, qty, options}"
        bigint branch_id FK "nullable"
        varchar delivery_zone "nullable"
        varchar delivery_address "nullable"
        integer delivery_fee "default 0"
        varchar customer_name "nullable"
        varchar customer_phone "nullable"
        varchar customer_email "nullable"
        text comment "nullable"
        bigint deliverer_id FK "nullable"
        integer estimated_minutes "nullable"
        timestamp printed_at "nullable"
        timestamp delivered_at "nullable"
        timestamp created_at
        timestamp updated_at
    }

    branches ||--o{ orders : "branch_id"
    deliverers ||--o{ orders : "deliverer_id"

    menu_items {
        bigint id PK
        jsonb category "i18n {zh-TW, en}"
        jsonb name "i18n {zh-TW, en}"
        integer price
        varchar image "nullable"
        jsonb options_schema "default []"
        jsonb timeslots "default [all]"
        integer sort_order "default 0"
        boolean available "default true"
        timestamp created_at
        timestamp updated_at
    }

    order_items {
        bigint id PK
        bigint order_id FK
        bigint menu_item_id FK "nullable"
        varchar name "snapshot"
        integer base_price
        integer qty "default 1"
        jsonb options "default {}"
        integer subtotal
        timestamp created_at
        timestamp updated_at
    }

    orders ||--o{ order_items : "order_id"
    menu_items ||--o{ order_items : "menu_item_id"

    restaurant_sessions {
        bigint id PK
        bigint branch_id FK
        integer table_number
        varchar token UK
        varchar status "default active"
        timestamp created_at
        timestamp expires_at
    }

    branches ||--o{ restaurant_sessions : "branch_id"
```

### Table Status

| Table | Status | Notes |
|-------|--------|-------|
| `branches` | **ACTIVE** | 2 seeded rows (TM01, TSW01) |
| `orders` | **ACTIVE** | Core order table, items stored as JSON column |
| `deliverers` | **ACTIVE** | Server-side session via `session_token` |
| `menu_items` | **DEAD** | Menu hardcoded in HTML `data-*` attrs; table exists but empty |
| `order_items` | **DEAD** | Replaced by `orders.items` JSON column; never written to |
| `restaurant_sessions` | **DEAD** | Dine-in feature removed; table exists but unused |

### Dead Columns on `orders`

| Column | Why Dead |
|--------|----------|
| `qr_token` | Pickup code = `order_number` directly; never populated |
| `table_number` | Dine-in removed |
| `session_token` | Dine-in session; not the deliverer session |

### Missing Migration

| Column | Table | Status |
|--------|-------|--------|
| `session_token` | `deliverers` | Used by `RestaurantDelivererService` but **no migration** creates it. Likely added manually. Should formalize with migration. |
| `items` (json) | `orders` | Used by `RestaurantOrderService` but **no migration** adds it. Likely added manually. Should formalize with migration. |

---

## IndexedDB ERD (Client — Customer Only)

```mermaid
erDiagram
    cartItems {
        int id PK "auto-increment"
        string name "item name"
        int price "base price"
        array options "option schema from HTML data-options"
        object selected "user selections {key: choiceIndex}"
    }

    orders {
        int id PK "auto-increment"
        string orderNumber "local TIS001 format"
        string status "pending | printed | delivering | delivered"
        array items "snapshot [{name, subtotal, options}]"
        string deliveryZone
        string deliveryAddress
        int deliveryFee
        float distanceKm
        string customerName
        string customerPhone
        string comment "nullable"
        int subtotal
        int total "subtotal + deliveryFee"
        string apiOrderNumber "nullable, from API response"
        int delivererId "nullable, index"
        int estimatedMinutes
        string createdAt "ISO string"
        string printedAt "nullable"
        string deliveredAt "nullable"
    }
```

### IndexedDB Version History

| Version | Stores | Change |
|---------|--------|--------|
| v1 | cartItems, orders | Initial: `++id, name` / `++id, order_number, status, time` |
| v2 | cartItems, orders | Rename fields: `orderNumber, createdAt`. Clear old orders. |
| v3 | cartItems, orders, deliverers | Add deliverers store (phone, name, status) |
| v4 | cartItems, orders | **Drop deliverers** (moved to PostgreSQL) |

---

## localStorage Keys (All Interfaces)

```mermaid
erDiagram
    localStorage {
        string locale "zh-TW | en"
        json delivery-info "{ zone, address, name, phone, email, comment }"
        json kitchen-session "{ id, code, name }"
        json deliverer-session "{ id, phone, name, token }"
        json menu-unavailable "string[] of item names"
        string order-counter "sequential number for local IDB orderNumber"
    }
```

| Key | Interface | Purpose |
|-----|-----------|---------|
| `locale` | All | Current language |
| `delivery-info` | Customer | Saved checkout form fields for convenience |
| `kitchen-session` | Kitchen | Branch login state `{ id, code, name }` |
| `deliverer-session` | Deliverer | Login state `{ id, phone, name, token }` |
| `menu-unavailable` | Customer + Kitchen | Array of unavailable item names, cross-tab via `storage` event |
| `order-counter` | Customer | Local sequential counter for IDB orderNumber (TIS001, TIS002...) |

---

## Data Flow: Order Lifecycle

```
                    PostgreSQL                          IndexedDB
                    ══════════                          ═════════
Customer POST ─────► orders.insert ◄── Event ──┐        orders.add
  (cart-page)       status: pending             │        (local copy)
                         │                      │            │
Kitchen PATCH ──────► status: printed           │        poll ► apiOrderNumber
  (kitchen-page)         │                      │            │
                         │                      │        Status mapping:
Deliverer GET ──────► orders by pickup code     │        pending → "準備中"
  (delivery-page)        │                      │        printed → "等待外送員接單中"
                         │                      │        delivering → "已結單"
Deliverer PATCH ────► status: delivering        │        delivered → "已結單"
  (delivery-page)    deliverer_id: set          │
                         │                      │
Deliverer PATCH ────► status: delivered         │
  (delivery-task)    delivered_at: now()         │
                         │                      │
                    RestaurantOrderUpdated ──────┘
                    (WebSocket broadcast)
```

---

## Relationship Summary

```
branches  1 ──── * orders        (branch_id FK, nullable, nullOnDelete)
deliverers 1 ──── * orders        (deliverer_id FK, nullable, nullOnDelete)
menu_items 1 ──── * order_items   (DEAD — not used)
orders     1 ──── * order_items   (DEAD — not used)
branches   1 ──── * restaurant_sessions (DEAD — not used)
```

Active foreign keys: **2** (orders.branch_id → branches, orders.deliverer_id → deliverers)
Dead foreign keys: **3** (order_items.order_id, order_items.menu_item_id, restaurant_sessions.branch_id)
