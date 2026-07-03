# Coffee Oasis POS System

## Working With the User

- **Suggestions are proposals, not instructions.** When the user suggests an approach, cross-check it technically — does it fit the architecture, are there edge cases, is there a simpler way? Flag concerns or alternatives before proceeding. Reach consensus first, then implement.
- **Only ask questions when the answer changes what you do next.** Don't ask filler questions or seek confirmation you don't actually need.
- **Confirm UI changes are working.** Don't report frontend work as done until the user confirms it works on their end. The POS runs on a separate Windows PC.
- **Be direct and concise.** Skip unnecessary preamble, summaries of what was just said, and verbose explanations.

## Overview

Physical point-of-sale system for Coffee Oasis, a grab-and-go coffee shop in Malaysia. Runs on a local Windows PC with multi-screen setup (POS, customer display, kitchen display). Core POS data is local SQLite — no cloud dependency for in-store operations. Online ordering and loyalty data live in Supabase (shared with customer-facing app bubu1).

## Stack

- **Framework:** Next.js 14.2 (App Router)
- **Language:** TypeScript
- **Database:** SQLite via better-sqlite3 (no ORM — raw SQL) for local POS data
- **Cloud DB:** Supabase (PostgreSQL) for online orders, loyalty, receipts, order sync — shared with customer app
- **Cloud Storage:** Supabase Storage for receipt HTML files
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Currency:** Malaysian Ringgit (RM)
- **Timezone:** Asia/Kuala_Lumpur (UTC+8, no DST)

## Running

```bash
npm run dev          # Development (binds 0.0.0.0)
npm run build        # Production build
npm run start        # Production (binds 0.0.0.0)
```

Database auto-creates at `prisma/dev.db` on first run.

## Architecture

### Data Split: SQLite vs Supabase

- **SQLite (local, source of truth for the shop):** Products, recipes, materials, stock, orders, COGS/consumption, purchase orders, branches
- **Supabase (cloud, shared with bubu1 customer app):** Online orders, loyalty programs/members/transactions, vouchers, passes, receipt files, synced product catalog, synced POS orders

The POS works offline for core operations. Supabase features (loyalty, online orders, receipts) degrade gracefully if internet is unavailable.

### Database Layer (`lib/db/`)

All database access goes through service files. No ORM — direct `better-sqlite3` prepared statements.

- **`init.ts`** — Schema creation, migrations, singleton DB connection. Tables auto-create on first run.
- **`productService.ts`** — Products. Primary key is a local UUID (`id`). Optional `wcId` for legacy WooCommerce mapping.
- **`materialService.ts`** — Raw materials and packaging (coffee beans, cups, stickers). Each has `costPerUnit`.
- **`recipeService.ts`** — Product recipes linking products to materials and other products. Supports XOR selection groups, optional items, linked products.
- **`recursiveProductExpansion.ts`** — Flattens nested recipe trees. `flattenAllChoices()`, `calculatePriceWithSelections()`, `calculateCOGSWithSelections()`.
- **`inventoryConsumptionService.ts`** — Records material consumption when orders are created. `recordProductSale()` recursively walks the full recipe tree (combo → product → materials), deducting from BranchStock and creating `InventoryConsumption` records.
- **`branchStockService.ts`** — Branch-level inventory, source of truth for stock quantities.
- **`orderService.ts`** — Order queries for reports and daily stats. `toWcOrderShape()` converts to API-friendly format.
- **`onlineOrderService.ts`** — Queries Supabase `online_orders` for sales reports.
- **`stockMovementService.ts`** — Audit log for all stock changes.
- **`purchaseOrderService.ts`** — Purchase order management for restocking.
- **`bundleExpansionService.ts`** — Expand bundle selections into component list for display.

### ID System

Products use local UUIDs as primary identifiers everywhere. Some products also have a `wcId` (WooCommerce numeric ID) from legacy sync. Lookup pattern: try `getProduct(id)` first, fall back to `getProductByWcId(wcId)`.

### Branch System

Multi-branch aware. Branch ID flows via `X-Branch-Id` HTTP header, set by `branchContext.tsx` on the client. `getBranchIdFromRequest()` extracts it server-side. Currently single-branch ("Main Branch", id: `branch-main`).

### Cart & Pricing (`context/cartContext.tsx`)

Client-side cart with:
- `retailPrice` — catalog price
- `discountPercent` / `discountAmount` — staff-applied discounts
- `surchargeAmount` — upgrades/additions
- `finalPrice` — computed: retail - discount + surcharge
- `bundle` — for combo products: stores `selectedMandatory` (XOR choices) and `selectedOptional`
- `components` — expanded bundle components for display
- `customer` — loyalty member (`member_id`, `phone`, `name`) set by QR scan
- `voucher` — applied voucher (`code`, `type`, `discount_value`, `discount_amount`)
- `pass` — applied pass (`id`, `code`, `program_name`, `uses_remaining`, `eligible_product_ids`)

Cart persists to `localStorage` and syncs to server via `/api/cart/current` for the customer display. Sync includes voucher and pass data.

### Combo/Bundle Products

Products can be combos (e.g., "Nasi Lemak Combo" = nasi lemak + choice of drink). The recipe system models this with:

1. **XOR groups** — Mutually exclusive choices (e.g., "Drink" group with 4 coffee options)
2. **Nested XOR** — Each coffee option may have its own "Temp" group (Hot/Iced)
3. **Optional items** — Add-ons
4. **Mandatory individual** — Always-included items

Selection flow: Product page → fetch `/api/products/{id}/recipe` → if `needsModal`, show `ProductSelectionModal` → user picks options → selections stored in cart `bundle` field → sent to order creation as `_bundle_mandatory`/`_bundle_optional` metadata.

### COGS Pipeline

Two parallel paths:

1. **Real-time display** (POS cart): `/api/products/{id}/cogs` → `calculateProductCOGS()` with live bundle selection → shown in cart UI. Read-only.

2. **Order recording**: `create-with-payment` → `recordProductSale()` → creates `InventoryConsumption` records + recursively deducts `BranchStock` for all materials in the recipe tree. Reports read from `InventoryConsumption`.

Both traverse the same recipe tree. Bundle selection data must be passed for correct COGS on combo products.

### Order Creation Flow (`POST /api/orders/create-with-payment`)

This is the main order creation path. On each sale:

1. Look up products in SQLite, calculate COGS
2. Insert `Order` + `OrderItem` rows into SQLite
3. Record inventory consumption (recursive material deduction)
4. Auto-create pass enrollments if purchased products match a pass program
5. Sync order to Supabase `pos_orders` table (fire-and-forget)
6. Return order to client

After the client receives the response, the payment page:
7. Records voucher usage if applied
8. Awards purchase points if customer is linked
9. Records pass usage if applied
10. Generates and uploads HTML receipt to Supabase Storage

### Receipt System

- **USB thermal printer** — ESC/POS via Win32 Print Spooler (`scripts/receipt-print-server.js` + `scripts/raw-print.ps1`). POS-58 58mm thermal printer. Prints QR code linking to online receipt.
- **HTML receipts** — Generated by `lib/receiptGenerator.ts`, uploaded to Supabase Storage bucket `receipts` via `lib/receiptStorage.ts`. Self-contained HTML (no JS, no external CSS). Mascot image stored in same bucket.
- **Receipt URLs:** `{SUPABASE_URL}/storage/v1/object/public/receipts/order-{orderId}.html`
- **Setup:** `POST /api/receipts/setup` creates the bucket and uploads the mascot image.

### Label Printer

CLabel B21 via Web Bluetooth (`lib/labelPrinterService.ts`). TSPL commands, 15mm x 30mm labels. Used from kitchen display for order labels.

### Kitchen Display

`/kitchen` — SSE-based real-time updates via `lib/sse/orderStreamManager.ts`. Orders appear after payment, staff marks as ready. Auto-fit grid for tablets/Chromebooks. Accessible from LAN devices.

### Customer Display

`/customer-display` — SSE-based via `lib/sse/cartStreamManager.ts`. Shows current cart items, voucher/pass discounts, and totals in real time. Updates when cart changes or payment starts.

### QR Scan System (`components/LoyaltyScanListener.tsx`)

Global QR scan listener on the POS page. Uses `useScanDetector` hook to detect barcode scanner input. Routes scans based on content:

- **Phone number** (e.g., `+60123456789`) → `/api/loyalty/scan` → daily check-in stamp + set customer in cart
- **Pass code** (`PASS-XXXXXXXX`) → `/api/passes/validate` → validate pass, set in cart, trigger check-in
- **Voucher code** (alphanumeric) → `/api/vouchers/validate` → validate voucher, set in cart, trigger check-in

All three paths set the customer in cart context and trigger a check-in scan (with daily dedup).

### Loyalty System

Multi-program loyalty system stored in Supabase. Managed via `/admin/loyalty`.

**Program types** (`loyalty_programs.trigger_type`):
- **`scan`** — Daily check-in stamps. 1 stamp per day per customer (deduped via `loyalty_transactions` date query). Threshold triggers voucher.
- **`purchase`** — Points per order. Awarded after payment via `/api/loyalty/purchase-points`. Points = `floor(order_total * points_per_rm)`.
- **`manual`** — Staff-awarded points via admin UI.
- **`pass`** — Product passes (drink passes, weekly coffee clubs). See Passes section.

**Key tables (Supabase):**
- `loyalty_programs` — Program definitions (threshold, voucher value, pass config)
- `loyalty_members` — Customers keyed by phone
- `loyalty_member_programs` — Per-member per-program balances and pass enrollments
- `loyalty_transactions` — Audit log of all point events
- `vouchers` — Auto-generated from milestones or manually created
- `loyalty_program_products` — Join table: which products are eligible for a pass program
- `member_pass_usage` — Per-use audit log for passes

**Key service (`lib/loyaltyService.ts`):**
- `upsertMember(phone, name)` — Find or create loyalty member
- `awardPoints(member, program, opts)` — Award points, auto-issue voucher at threshold
- `createOrTopUpPass(member, program, opts)` — Create or top-up pass enrollment
- `todayRangeKL()` — Malaysia UTC+8 date range (shared via `lib/dateUtils.ts`)

**Check-in dedup:** `todayRangeKL()` computes today's start/end in KL timezone using direct UTC+8 offset math (no `toLocaleString`, no DST). Queries `loyalty_transactions` for existing scan-type entries in range.

### Passes

Passes are loyalty programs with `trigger_type = 'pass'`. Stored as `loyalty_member_programs` rows with a `PASS-XXXXXXXX` code.

**Pass types:**
- **`use_based`** — Fixed number of uses, top-up allowed. E.g., "5 Drink Pass."
- **`time_based`** — Cannot top-up while active. E.g., "Weekly Coffee Club."

**Daily limits:** `pass_daily_limit` on `loyalty_programs` caps uses per day. Checked at validation and deduction time by counting today's `member_pass_usage` entries.

**Auto-creation:** When a product linked via `pass_product_id` is purchased and a customer is linked, `create-with-payment` auto-creates the pass enrollment.

**Payment guard:** If a pass product is in the cart but no customer has been scanned, the payment page blocks checkout with a warning.

**Validation flow:** Scan pass QR → `/api/passes/validate` (checks active, uses remaining, daily limit, expiry) → set pass in cart → payment page calculates discount for eligible items → `/api/passes/use` deducts uses and records to `member_pass_usage`.

### Vouchers

Auto-generated when a loyalty program threshold is reached, or manually created via admin.

- `code` — Unique alphanumeric code, displayed as QR
- `type` — `fixed` (RM amount) or `percent`
- `discount_value` — Amount or percentage
- `min_order_amount` — Minimum order to use
- `max_uses` / `times_used` — Usage tracking
- `expires_at` — Optional expiry
- `member_id` — Optional link to loyalty member

Validation: `/api/vouchers/validate`. Redemption: `/api/vouchers/use` (increments `times_used` via Supabase RPC).

### Online Orders (`/admin/online-orders`)

Kanban board for managing orders from the customer-facing web app (bubu1). Shares a Supabase database — no API calls between apps.

**Architecture:** Customer app writes `online_orders` + `online_order_items` to Supabase after Fiuu payment. POS subscribes via Supabase Realtime and updates order status.

**Status flow:** `pending` → `accepted` | `rejected`, `accepted` → `ready` | `rejected`, `ready` → `collected`.

**On accept:** Supabase `decrement_stock` RPC decrements product-level stock (customer-facing availability). `recordProductSale()` recursively deducts materials from local BranchStock and records COGS.

**Features:** Audio alerts for new orders, pause/resume intake toggle, reject with optional reason, 15s polling fallback alongside Realtime.

### Catalog Sync (`lib/catalogSync.ts`)

Product catalog auto-syncs from local SQLite to Supabase so the customer-facing app reads real products.

**Flow:** Staff edits product in POS admin → SQLite writes → async Supabase upsert (fire-and-forget) → customer app reads from Supabase.

**Key functions:** `syncProduct(id)`, `syncRecipe(productId)`, `syncAllProducts()`, `syncAllRecipes()`.

**API:** `POST /api/admin/catalog-sync` triggers a full sync.

### POS Order Sync (`lib/orderSync.ts`)

After each POS sale, the order is fire-and-forget synced to Supabase `pos_orders` + `pos_order_items`. This lets the customer app (bubu1) show in-person purchase history.

Only orders where the customer scanned their QR have `loyalty_member_phone` populated. Walk-in orders sync but aren't queryable by customer.

### Supabase Clients

- `lib/supabase.ts` — Server-side, uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)
- **No browser Supabase client.** The POS never touches Supabase from the browser (the anon key is not shipped in the bundle). Live online-order updates come via server-side SSE: `lib/sse/onlineOrderStreamManager.ts` holds a single service-role Supabase Realtime subscription on `online_orders` and fans changes out to the POS screens through `/api/online-orders/stream`. This lets `online_orders` (and the other Supabase tables) be locked with RLS while keeping instant push.

## Active Pages

### Staff-facing
- `/admin` — Dashboard with daily stats
- `/admin/pos` — **Primary POS interface**. Cart, discounts, surcharges, COGS display, hold orders, customer/voucher/pass strip.
- `/admin/online-orders` — **Online order Kanban board**. Accept/reject/ready/collect.
- `/admin/loyalty` — **Loyalty management**. Scan tab, members list, program CRUD (stamp/purchase/pass).
- `/admin/loyalty/members/[memberId]` — Member detail: balances, passes with usage history, vouchers, transactions.
- `/products` — Product catalog / menu. Tap to add to cart, selection modal for combos.
- `/payment` — Payment method selection (cash / bank QR), order creation, pass product guard.
- `/kitchen` — Kitchen display system (for kitchen staff / tablet)

### Customer-facing
- `/customer-display` — Shows current cart/order with voucher/pass discounts on customer-facing screen

### Admin
- `/admin/sales` — Sales reports with COGS analysis
- `/admin/sales/daily` — Daily order details
- `/admin/orders` — Order management
- `/admin/recipes` — Recipe builder
- `/admin/materials` — Material management
- `/admin/products` — Product management
- `/admin/stock-check` — Stock auditing
- `/admin/stock-usage` — Stock movement history
- `/admin/purchase-orders` — Purchase order management
- `/admin/branches` — Branch management
- `/admin/printers` — Printer configuration

### Experimental (not in production)
- `/delivery`, `/customer`, `/login`, `/register`, `/settings`, `/orders`, `/profile`
- `/admin/lockers`, `/admin/promo-generator`

## API Structure (`app/api/`)

All API routes are Next.js Route Handlers.

### Orders
- `POST /api/orders/create-with-payment` — Create order, record COGS, auto-create passes, sync to Supabase
- `GET /api/orders/{orderId}` — Get order details
- `PATCH /api/orders/{orderId}/update-items` — Update order items

### Products
- `GET /api/products` — Returns all visible products (flat array, `price` as string)
- `GET /api/products/{id}/recipe` — Recipe with flattened XOR groups for selection modal
- `GET /api/products/{id}/cogs` — Real-time COGS calculation
- `POST /api/bundles/expand` — Returns selected bundle components for display

### Cart & Display
- `GET/POST /api/cart/current` — Cart state sync for customer display (includes voucher, pass)
- `GET /api/cart/stream` — SSE stream for customer display

### Kitchen
- `GET /api/kitchen/orders` — Kitchen order feed
- `GET /api/kitchen/stream` — SSE stream for kitchen display

### Online Orders
- `GET /api/online-orders` — Active online orders from Supabase
- `PATCH /api/online-orders/[orderId]` — Update status with transition validation
- `GET/POST /api/online-orders/intake` — Pause/resume online ordering
- `GET /api/online-orders/avg-wait` — Average wait time

### Loyalty
- `GET /api/loyalty/config` — List all programs
- `POST /api/loyalty/config` — Create program
- `PUT /api/loyalty/config` — Update program
- `POST /api/loyalty/scan` — Process phone QR scan (check-in, dedup, award points)
- `POST /api/loyalty/purchase-points` — Award purchase-based points
- `GET /api/loyalty/members` — List members (with search)
- `GET /api/loyalty/members/[memberId]` — Member detail (balances, transactions, vouchers)
- `POST /api/loyalty/members/[memberId]/adjust` — Manual point adjustment
- `GET /api/loyalty/program-products` — List eligible products for a program
- `PUT /api/loyalty/program-products` — Replace eligible products for a program
- `GET /api/loyalty/pass-usage/[enrollmentId]` — Pass usage history

### Passes
- `POST /api/passes/validate` — Validate pass code, check daily limit, return eligible products
- `POST /api/passes/use` — Deduct pass uses, record to `member_pass_usage`

### Vouchers
- `POST /api/vouchers/validate` — Check voucher validity
- `POST /api/vouchers/use` — Increment usage count

### Receipts
- `POST /api/receipts/generate` — Generate HTML receipt, upload to Supabase Storage
- `POST /api/receipts/setup` — Create storage bucket and upload mascot image

### Admin
- `GET /api/admin/sales` — Sales report with COGS
- `GET /api/admin/sales/daily` — Daily order breakdown
- `POST /api/admin/catalog-sync` — Full product/recipe sync to Supabase
- `POST /api/debug/recreate-consumptions` — Backfill missing COGS

## Key Files

```
app/admin/pos/page.tsx            — Staff POS (primary interface)
app/admin/online-orders/page.tsx  — Online order Kanban board
app/admin/loyalty/page.tsx        — Loyalty program management
app/products/page.tsx             — Product catalog with selection modal
app/payment/page.tsx              — Payment flow, pass guard, order creation
app/kitchen/page.tsx              — Kitchen display
app/customer-display/page.tsx     — Customer-facing display

context/cartContext.tsx            — Cart state: items, customer, voucher, pass
context/branchContext.tsx          — Branch selection, X-Branch-Id header

lib/db/init.ts                    — Database schema and connection
lib/db/productService.ts          — Product CRUD (auto-syncs to Supabase)
lib/db/recipeService.ts           — Recipe management (auto-syncs to Supabase)
lib/db/inventoryConsumptionService.ts — COGS recording (recursive recipe traversal)
lib/db/branchStockService.ts      — Stock management (source of truth)
lib/db/orderService.ts            — Order queries
lib/db/recursiveProductExpansion.ts — Bundle flattening and price calculation

lib/loyaltyService.ts             — Loyalty: points, passes, voucher generation
lib/orderSync.ts                  — POS order sync to Supabase
lib/catalogSync.ts                — Product catalog sync to Supabase
lib/receiptGenerator.ts           — HTML receipt generation
lib/receiptStorage.ts             — Receipt upload to Supabase Storage
lib/dateUtils.ts                  — Malaysia timezone utilities
lib/supabase.ts                   — Supabase server client (service role)
lib/sse/onlineOrderStreamManager.ts — Server-side Supabase Realtime→SSE bridge for online orders
lib/printerService.ts             — Thermal printer (ESC/POS)
lib/labelPrinterService.ts        — Label printer (Web Bluetooth)

lib/sse/cartStreamManager.ts      — SSE broadcast for customer display
lib/sse/orderStreamManager.ts     — SSE broadcast for kitchen display

lib/hooks/useScanDetector.ts      — QR barcode scanner detection

components/LoyaltyScanListener.tsx — Global QR scan: phone, voucher, pass routing
components/ProductSelectionModal.tsx — Bundle/combo selection UI
components/CashPayment.tsx        — Cash payment with change calculation
components/HoldOrderManager.tsx   — Hold/resume order system

scripts/receipt-print-server.js   — USB thermal printer server
scripts/raw-print.ps1             — Win32 Print Spooler for ESC/POS
scripts/diagnose-orders.js        — Order COGS diagnostic tool
scripts/backup-supabase.js        — Backup loyalty/voucher data to JSON
```

## Supabase Tables

```
loyalty_programs              — Program definitions (scan/purchase/manual/pass)
loyalty_members               — Customers keyed by phone
loyalty_member_programs       — Per-member balances + pass enrollments
loyalty_transactions          — Point audit log
loyalty_program_products      — Pass → eligible products join table
member_pass_usage             — Pass use audit log
vouchers                      — Loyalty and manual vouchers

online_orders                 — Orders from customer app
online_order_items            — Line items for online orders

pos_orders                    — POS orders synced for customer history
pos_order_items               — POS order line items

products                      — Product catalog (synced from SQLite)
product_recipe_items           — Recipe items (synced from SQLite)
branches                      — Branch data
outlet_settings               — Branch settings (intake pause, etc.)
```

See `LOYALTY_SCHEMA.md`, `CATALOG_SCHEMA.md`, `POS_ORDERS_SCHEMA.md` for DDL.

## Bubu1 Integration

The customer-facing app (bubu1.vercel.app / www.coffee-oasis.com) shares Supabase with the POS. See:
- `BUBU1_LOYALTY.md` — Loyalty, passes, vouchers, order history queries
- `BUBU1_RECEIPTS.md` — Receipt generation for online orders
- `CATALOG_SCHEMA.md` — Product catalog and combo structure

## Auth

Simple sessionStorage-based admin auth. Staff enters a shared PIN at `/admin`. `sessionStorage.setItem('admin_auth', 'authenticated')` gates admin features.

## Environment Variables (`.env.local`)

```
# Supabase (loyalty, online orders, catalog sync, receipts, order sync)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# WooCommerce (legacy — not required)
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...

# Legacy (no longer used — replaced by Supabase Storage)
# FTP_HOST, FTP_USER, FTP_PASSWORD, FTP_RECEIPT_PATH
# NEXT_PUBLIC_RECEIPT_DOMAIN
```

## Multi-Screen Setup

POS server binds to `0.0.0.0:3000`. Other devices on the LAN connect by IP:
- **POS terminal:** `http://localhost:3000/admin/pos`
- **Customer display:** `http://<ip>:3000/customer-display`
- **Kitchen display:** `http://<ip>:3000/kitchen`

Windows Firewall must allow inbound TCP 3000 for cross-device access.

## Common Operations

```bash
# Diagnose order COGS
node scripts/diagnose-orders.js 18 24 25

# Backfill missing COGS (all orders)
curl -X POST http://localhost:3000/api/debug/recreate-consumptions \
  -H "Content-Type: application/json" -d '{"backfillAll":true,"force":true}'

# Full catalog sync to Supabase
curl -X POST http://localhost:3000/api/admin/catalog-sync

# Setup receipt storage bucket
curl -X POST http://localhost:3000/api/receipts/setup

# Backup Supabase data
node scripts/backup-supabase.js

# Database backup
copy prisma\dev.db prisma\backup-%date%.db

# Clear build cache
rmdir /s /q .next
npm run build
```
