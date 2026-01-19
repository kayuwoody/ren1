# Architecture Roadmap - Coffee Oasis POS

**Created:** January 2026
**Status:** Planning Phase
**Last Updated:** This document captures architectural decisions from planning discussion.

---

## Executive Summary

Coffee Oasis is evolving from a WooCommerce-dependent POS to a unified, self-hosted platform supporting multiple ordering channels. WooCommerce will be removed once the customer-facing app is complete.

---

## Current State

```
┌─────────────┐      ┌─────────────────┐
│   POS       │ ←──▶ │   WooCommerce   │
│  (Next.js)  │      │                 │
│             │      │ • Products      │
│ • Recipes   │      │ • Orders        │
│ • Materials │      │ • Inventory     │
│ • COGS      │      │ • Payments      │
│ • Kitchen   │      │   (via Fiuu)    │
│ • Offline   │      │                 │
└─────────────┘      └─────────────────┘
      │                      │
      └──────────────────────┘
           Bidirectional Sync
```

### What Works Well
- Local POS with offline capability
- Recipe/material management with COGS tracking
- Kitchen display with real-time updates (SSE)
- Inventory consumption tracking
- Purchase order management

### Pain Points with WooCommerce
1. **Point of failure** - WC downtime affects online orders
2. **Latency** - Orders route through WC API
3. **Dual updates** - Products, orders, inventory in two places
4. **Sync complexity** - Keeping systems in sync is fragile

---

## Target State

```
                    ORDERING CHANNELS
    ┌──────────┬──────────┬──────────┬──────────┐
    │  Staff   │   Web    │  Mobile  │  Locker  │
    │   POS    │   App    │   PWA    │  Kiosk   │
    └────┬─────┴────┬─────┴────┬─────┴────┬─────┘
         │          │          │          │
         └──────────┴──────────┴──────────┘
                        │
              ┌─────────▼─────────┐
              │     Your API      │
              │     (Next.js)     │
              ├───────────────────┤
              │ • Products        │
              │ • Orders          │
              │ • Inventory       │
              │ • Recipes/COGS    │
              │ • Customer accts  │
              │ • Promos/loyalty  │
              │ • Fiuu direct     │
              │ • Locker IoT      │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │      SQLite       │
              │  (→ PostgreSQL    │
              │   when scaling)   │
              └───────────────────┘

              WooCommerce: REMOVED
```

---

## Key Architectural Decisions

### 1. No E-Commerce Platform (Medusa, Saleor, etc.)

**Decision:** Build on existing codebase, don't adopt Medusa/Saleor/Vendure.

**Rationale:**
- E-commerce platforms are designed for online stores, not POS
- They don't support: offline-first, recipe management, COGS, kitchen displays, locker integration
- Would still need to build all custom features on top
- Current codebase already handles the hard parts

### 2. PWA for All Customer-Facing Apps

**Decision:** Single PWA serves web, mobile, and locker kiosks.

**Implementation:**
- Same Next.js codebase as staff POS
- Customer-facing routes under `/customer/*`
- Installable on mobile home screens
- Runs in kiosk mode on locker mini PCs
- Offline support via service workers

**Why not native apps:**
- Same codebase = less maintenance
- Lockers run mini PCs with browsers anyway
- PWA capabilities sufficient for ordering
- Can wrap with Capacitor later if app store presence needed

### 3. Direct Fiuu Integration

**Decision:** Integrate Fiuu payment API directly, remove WooCommerce payment dependency.

**Status:** In progress (channel selection issue being resolved)

**Benefits:**
- Remove WC from critical payment path
- Faster transactions
- Works for all channels (POS, web, mobile, kiosk)

### 4. SQLite Now, PostgreSQL Later

**Decision:** Keep SQLite until multi-location is needed.

**Rationale:**
- SQLite works well for single location
- Migration to PostgreSQL is straightforward with proper abstractions
- Premature optimization to migrate now
- When needed: Consider PowerSync or ElectricSQL for offline sync

### 5. Customer Accounts In-House

**Decision:** Build customer auth with NextAuth.js, not external providers.

**Features needed:**
- Email/phone login
- Order history
- Loyalty points
- Membership tiers
- Promo eligibility

---

## Ordering Channels

### 1. Staff POS (Existing)
- Location: `/admin/pos`
- Full product catalog with recipes
- Discounts, bundles, custom pricing
- Kitchen integration
- Cash + digital payments

### 2. Customer Web App (To Build)
- Location: `/customer/*`
- Stripped-down POS interface
- Browse menu, add to cart
- Customer account login
- Order history
- Apply promos/loyalty points

### 3. Mobile App (PWA)
- Same as web app, installed on home screen
- Push notifications for order ready
- Offline menu browsing

### 4. Locker Kiosk (To Build)
- Same UI as customer web/mobile
- Runs on mini PC in kiosk mode (fullscreen browser)
- Two modes:
  - **Ordering mode:** Browse, order, pay
  - **Pickup mode:** Enter code, retrieve order

---

## Locker System Architecture

### Hardware Setup
```
Locker Unit
├── Mini PC (brain)
│   ├── Linux/Windows
│   ├── Chromium in kiosk mode
│   │   └── Customer PWA (fullscreen)
│   └── IoT controller software
│       └── API calls for lock/unlock
├── Compartments (multiple sizes)
├── Lock mechanisms (electronic)
└── Network connection
```

### Locker Flows

**Flow B: Order at Locker → Pick Up Later**
```
1. Customer approaches locker
2. Browses menu on kiosk screen
3. Adds items, proceeds to checkout
4. Pays via Fiuu (QR code on screen)
5. Receives pickup code
6. Kitchen prepares order
7. Staff loads into compartment
8. Customer returns with code
9. Enters code → compartment unlocks
10. Order complete
```

**Flow C: Order Online → Pick Up at Locker**
```
1. Customer orders via web/mobile app
2. Selects locker location for pickup
3. Pays via Fiuu
4. Kitchen prepares order
5. Staff loads into compartment
6. Customer notified (SMS/push/email)
7. Customer goes to locker
8. Enters pickup code
9. Compartment unlocks
10. Order complete
```

### Data Model Additions

```sql
-- Locker locations
CREATE TABLE Locker (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,           -- "Sunway Pyramid L1"
  location TEXT,                -- Address/description
  isActive INTEGER DEFAULT 1,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Individual compartments
CREATE TABLE Compartment (
  id TEXT PRIMARY KEY,
  lockerId TEXT NOT NULL,
  number INTEGER NOT NULL,      -- Compartment 1, 2, 3...
  size TEXT DEFAULT 'M',        -- S, M, L
  status TEXT DEFAULT 'available', -- available, reserved, occupied
  currentOrderId TEXT,          -- FK to order if occupied
  FOREIGN KEY (lockerId) REFERENCES Locker(id)
);

-- Order additions
ALTER TABLE Order ADD COLUMN customerId TEXT;
ALTER TABLE Order ADD COLUMN fulfillmentType TEXT DEFAULT 'pickup';
  -- pickup, locker, dine-in, delivery
ALTER TABLE Order ADD COLUMN lockerId TEXT;
ALTER TABLE Order ADD COLUMN compartmentId TEXT;
ALTER TABLE Order ADD COLUMN pickupCode TEXT;      -- 6-digit code
ALTER TABLE Order ADD COLUMN pickedUpAt TEXT;
```

---

## Customer Account System

### Data Model

```sql
CREATE TABLE Customer (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT,
  name TEXT,
  passwordHash TEXT,            -- For email login
  membershipTier TEXT DEFAULT 'bronze', -- bronze, silver, gold
  totalPoints INTEGER DEFAULT 0,
  totalSpent REAL DEFAULT 0,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
  lastOrderAt TEXT
);

CREATE TABLE CustomerSession (
  id TEXT PRIMARY KEY,
  customerId TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expiresAt TEXT NOT NULL,
  FOREIGN KEY (customerId) REFERENCES Customer(id)
);
```

### Authentication Flow
1. Customer enters email/phone
2. Receives OTP (or password for returning users)
3. Session created, token stored in cookie
4. Token validated on protected routes

### Membership Tiers
| Tier | Threshold | Benefits |
|------|-----------|----------|
| Bronze | Default | Earn points (1 per RM1) |
| Silver | RM500 spent | 1.5x points, birthday reward |
| Gold | RM2000 spent | 2x points, exclusive promos |

---

## Promo & Discount System

### Promo Types
1. **Percentage off** - 10%, 20%, etc.
2. **Fixed amount off** - RM5 off
3. **Buy X get Y** - Buy 2 get 1 free
4. **Bundle pricing** - Combo deals
5. **Points redemption** - 100 points = RM1
6. **Membership discounts** - Tier-based pricing

### Data Model

```sql
CREATE TABLE Promo (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE,             -- "WELCOME10"
  type TEXT NOT NULL,           -- percentage, fixed, bogo, points
  value REAL,                   -- 10 (for 10% or RM10)
  minOrderAmount REAL,
  maxDiscount REAL,
  validFrom TEXT,
  validUntil TEXT,
  usageLimit INTEGER,
  usageCount INTEGER DEFAULT 0,
  membershipTiers TEXT,         -- JSON array: ["silver", "gold"]
  productIds TEXT,              -- JSON array of applicable products
  isActive INTEGER DEFAULT 1
);

CREATE TABLE PromoUsage (
  id TEXT PRIMARY KEY,
  promoId TEXT NOT NULL,
  customerId TEXT,
  orderId TEXT NOT NULL,
  discountAmount REAL,
  usedAt TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (promoId) REFERENCES Promo(id)
);
```

---

## Implementation Roadmap

### Phase 1: Foundation
| Task | Priority | Notes |
|------|----------|-------|
| Direct Fiuu integration | P0 | Unblocks all channels |
| Customer auth (NextAuth.js) | P0 | Foundation for accounts |
| Customer database tables | P1 | Schema additions above |
| Order-customer linking | P1 | Associate orders with accounts |

### Phase 2: Customer App
| Task | Priority | Notes |
|------|----------|-------|
| Customer ordering UI | P0 | `/customer/*` routes |
| PWA manifest + service worker | P1 | Installable, offline menu |
| Order history page | P1 | Past orders for logged-in users |
| Guest checkout flow | P2 | Order without account |

### Phase 3: Locker Integration
| Task | Priority | Notes |
|------|----------|-------|
| Locker/compartment data model | P0 | Schema additions |
| Locker management admin UI | P1 | Add/edit lockers, view status |
| Pickup code generation | P1 | Secure 6-digit codes |
| Locker IoT API | P1 | Unlock endpoint |
| Kiosk mode UI | P2 | Fullscreen, touch-optimized |

### Phase 4: Loyalty & Promos
| Task | Priority | Notes |
|------|----------|-------|
| Points earning | P1 | Auto-award on order complete |
| Points redemption | P1 | Apply at checkout |
| Promo code system | P2 | Create, validate, apply |
| Membership tiers | P2 | Auto-upgrade based on spend |

### Phase 5: WooCommerce Removal
| Task | Priority | Notes |
|------|----------|-------|
| Migrate remaining WC data | P1 | Historical orders if needed |
| Remove WC sync code | P1 | Clean up lib/wooClient.ts etc |
| Remove WC dependencies | P2 | package.json cleanup |
| Update documentation | P2 | Remove WC references |

### Phase 6: Scale (Future)
| Task | Priority | Notes |
|------|----------|-------|
| PostgreSQL migration | P2 | When multi-location needed |
| Multi-location support | P2 | Central inventory, location-specific pricing |
| Offline sync (PowerSync) | P3 | True offline for unreliable connections |

---

## Tech Stack Summary

| Component | Current | Target | Change? |
|-----------|---------|--------|---------|
| Framework | Next.js 14 | Next.js 14 | No |
| Language | TypeScript | TypeScript | No |
| Database | SQLite | SQLite → PostgreSQL | Later |
| Payments | Fiuu via WC | Fiuu direct | Yes |
| Auth | None (staff only) | NextAuth.js | Add |
| Real-time | SSE | SSE | No |
| Mobile | N/A | PWA | Add |
| E-commerce | WooCommerce | None (self-built) | Remove |

---

## File Structure (Target)

```
app/
├── admin/              # Staff POS (existing)
│   ├── pos/
│   ├── kitchen/
│   ├── recipes/
│   ├── materials/
│   ├── orders/
│   ├── lockers/        # NEW: Locker management
│   └── promos/         # NEW: Promo management
├── customer/           # NEW: Customer-facing app
│   ├── menu/           # Browse products
│   ├── cart/           # Shopping cart
│   ├── checkout/       # Payment flow
│   ├── orders/         # Order history
│   ├── account/        # Profile, membership
│   └── kiosk/          # Locker-specific UI
├── api/
│   ├── auth/           # NEW: Customer auth
│   ├── customers/      # NEW: Customer CRUD
│   ├── lockers/        # NEW: Locker management
│   ├── promos/         # NEW: Promo validation
│   └── ...existing
└── ...existing

lib/
├── db/
│   ├── customerService.ts    # NEW
│   ├── lockerService.ts      # NEW
│   ├── promoService.ts       # NEW
│   └── ...existing
├── auth/
│   └── nextauth.ts           # NEW: Auth config
└── ...existing
```

---

## Migration Notes

### Removing WooCommerce

When customer app is live and Fiuu direct integration works:

1. **Stop syncing new orders to WC**
   - Comment out WC order creation in order flow
   - Test thoroughly

2. **Remove product sync dependency**
   - Products already in local DB
   - Remove WC product fetch on load

3. **Clean up code**
   - Remove `lib/wooClient.ts`
   - Remove `lib/wooApi.ts`
   - Remove WC-related API routes
   - Remove `@woocommerce/woocommerce-rest-api` from package.json

4. **Keep historical data**
   - WC order IDs in metadata for reference
   - Don't delete, just stop syncing

### Database Migration (SQLite → PostgreSQL)

When multi-location is needed:

1. **Add abstraction layer**
   - Wrap `better-sqlite3` calls in service layer (mostly done)
   - Ensure all queries are compatible

2. **Set up PostgreSQL**
   - Cloud: Supabase, Neon, or Railway
   - Self-hosted: Docker

3. **Migrate schema**
   - Export SQLite schema
   - Convert to PostgreSQL syntax
   - Run migrations

4. **Migrate data**
   - Export SQLite data as SQL inserts
   - Import to PostgreSQL

5. **Switch connection**
   - Update `lib/db/init.ts` to use PostgreSQL client
   - Test all queries

---

## Open Questions

1. **Fiuu channel selection** - What's the current blocker? Need to resolve for direct integration.

2. **Customer notifications** - SMS, email, push? Which provider?

3. **Locker hardware** - What's the IoT protocol? HTTP API? MQTT?

4. **Offline payments** - If internet down, cash only? Or store-and-forward?

5. **Multi-currency** - Malaysia only, or expansion plans?

---

## References

- `CONTEXT.md` - Current system context and patterns
- `AI_ASSISTANT_GUIDE.md` - Development guidelines
- `CRITICAL_FUNCTIONS.md` - Functions requiring approval to modify
- `PROJECT_DOCUMENTATION.md` - Full project documentation

---

**Document Owner:** Development Team
**Review Cycle:** Update after each major architectural decision
