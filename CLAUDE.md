# Coffee Oasis POS System

## Overview

Physical point-of-sale system for Coffee Oasis, a grab-and-go coffee shop in Malaysia. Runs on a local Windows PC with multi-screen setup (POS, customer display, kitchen display). All data is local SQLite — no cloud dependency for core operations.

## Stack

- **Framework:** Next.js 14.2 (App Router)
- **Language:** TypeScript
- **Database:** SQLite via better-sqlite3 (no ORM — raw SQL)
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Currency:** Malaysian Ringgit (RM)
- **Timezone:** Asia/Kuala_Lumpur (UTC+8)

## Running

```bash
npm run dev          # Development (binds 0.0.0.0)
npm run build        # Production build
npm run start        # Production (binds 0.0.0.0)
```

Database auto-creates at `prisma/dev.db` on first run.

## Architecture

### Database Layer (`lib/db/`)

All database access goes through service files. No ORM — direct `better-sqlite3` prepared statements.

- **`init.ts`** — Schema creation, migrations, singleton DB connection. Tables auto-create on first run via `CREATE TABLE IF NOT EXISTS`.
- **`productService.ts`** — Products. Primary key is a local UUID (`id`). Optional `wcId` for legacy WooCommerce mapping. Key functions: `getProduct(id)`, `getProductByWcId(wcId)`, `upsertProduct()`.
- **`materialService.ts`** — Raw materials and packaging (coffee beans, cups, stickers). Each has `costPerUnit` derived from purchase price.
- **`recipeService.ts`** — Product recipes linking products to materials and other products. Supports:
  - Material items (e.g., 15g coffee beans)
  - Linked product items (e.g., a combo containing an Americano)
  - XOR selection groups (`selectionGroup` field — mutually exclusive choices like "Choose Drink")
  - Optional items (`isOptional` flag)
- **`recursiveProductExpansion.ts`** — Flattens nested recipe trees for the UI. Key functions:
  - `flattenAllChoices()` — Collects all XOR groups and optional items from all nesting levels for the selection modal
  - `calculatePriceWithSelections()` — Computes price based on user selections
  - `calculateCOGSWithSelections()` — Computes COGS based on user selections (used by POS cart display)
  - `getSelectedComponents()` — Returns customer-facing component list for display
- **`inventoryConsumptionService.ts`** — Records material consumption when orders are created. `recordProductSale()` recursively walks the recipe tree, deducting materials from BranchStock and creating `InventoryConsumption` records. `calculateProductCOGS()` does the same traversal but read-only (for real-time display).
- **`branchStockService.ts`** — Branch-level inventory. Source of truth for stock quantities. Products and materials both track stock per branch.
- **`orderService.ts`** — Order queries for reports and daily stats.
- **`stockMovementService.ts`** — Audit log for all stock changes.
- **`purchaseOrderService.ts`** — Purchase order management for restocking.

### ID System

Products use local UUIDs as primary identifiers throughout the system. Some products also have a `wcId` (WooCommerce numeric ID) from legacy sync, but this is optional and not relied upon. All API endpoints, cart items, recipe links, and consumption records use the local UUID.

When looking up products, the pattern is: try `getProduct(id)` first (local UUID), fall back to `getProductByWcId(wcId)` for backwards compatibility.

### Branch System

Multi-branch aware. Branch ID flows via `X-Branch-Id` HTTP header, set by `branchContext.tsx` on the client. `getBranchIdFromRequest()` extracts it server-side, falling back to the default branch. Currently single-branch ("Main Branch", id: `branch-main`).

### Cart & Pricing (`context/cartContext.tsx`)

Client-side cart with:
- `retailPrice` — catalog price
- `discountPercent` / `discountAmount` — staff-applied discounts
- `surchargeAmount` — upgrades/additions
- `finalPrice` — computed: retail - discount + surcharge
- `bundle` — for combo products: stores `selectedMandatory` (XOR choices) and `selectedOptional`
- `components` — expanded bundle components for display

Cart persists to `localStorage` and syncs to server via `/api/cart/current` for the customer display.

### Combo/Bundle Products

Products can be combos (e.g., "Nasi Lemak Combo" = nasi lemak + choice of drink). The recipe system models this with:

1. **XOR groups** — Mutually exclusive choices (e.g., "Drink" group with 4 coffee options)
2. **Nested XOR** — Each coffee option may have its own "Temp" group (Hot/Iced)
3. **Optional items** — Add-ons like "Milk drink"
4. **Mandatory individual** — Always-included items (e.g., Nasi Lemak Bungkus)

Selection flow: Product page → fetch `/api/products/{id}/recipe` → if `needsModal`, show `ProductSelectionModal` → user picks options → selections stored in cart `bundle` field → sent to order creation as `_bundle_mandatory`/`_bundle_optional` metadata.

### COGS Pipeline

Two parallel paths serve different purposes:

1. **Real-time display** (POS cart): `/api/products/{id}/cogs` → `calculateProductCOGS()` with live bundle selection → shown in cart UI. Read-only, not persisted.

2. **Order recording**: `create-with-payment` → `recordProductSale()` → creates `InventoryConsumption` records + deducts `BranchStock`. Reports read from `InventoryConsumption` via `getOrderConsumptions()`.

Both traverse the same recipe tree. Bundle selection data (`_bundle_mandatory`, `_bundle_optional`) must be passed to both for correct COGS on combo products.

### Receipt System

Dual output:
- **USB thermal printer** — ESC/POS via Win32 Print Spooler (`scripts/receipt-print-server.js` + `scripts/raw-print.ps1`). POS-58 58mm thermal printer.
- **HTML receipts** — Generated by `lib/receiptGenerator.ts`, uploaded via FTP to Hostinger for customer access.

### Label Printer

CLabel B21 via Web Bluetooth (`lib/labelPrinterService.ts`). TSPL commands, 15mm x 30mm labels. Used from kitchen display for order labels.

### Kitchen Display

`/kitchen` — SSE-based real-time updates. Orders appear after payment, staff marks as ready. Auto-fit grid for tablets/Chromebooks. Accessible from LAN devices.

## Active Pages

### Staff-facing
- `/admin` — Dashboard with daily stats
- `/admin/pos` — **Primary POS interface**. Cart, discounts, surcharges, COGS display, hold orders.
- `/products` — Product catalog / menu. Tap to add to cart, selection modal for combos.
- `/payment` — Payment method selection (cash / bank QR), order creation.
- `/kitchen` — Kitchen display system (for kitchen staff / tablet)

### Customer-facing
- `/customer-display` — Shows current cart/order on customer-facing screen

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
- `/delivery`, `/customer`, `/login`, `/register`, `/test-payment`, `/settings`, `/orders`, `/profile`
- `/admin/lockers`, `/admin/loyalty`, `/admin/promo-generator`

## API Structure (`app/api/`)

All API routes are Next.js Route Handlers. Key endpoints:

- `POST /api/orders/create-with-payment` — Creates order, records inventory consumption, calculates COGS. The main order creation path.
- `GET /api/products` — Returns all visible products with local UUID as `id`.
- `GET /api/products/{id}/recipe` — Recipe with flattened XOR groups for selection modal.
- `GET /api/products/{id}/cogs` — Real-time COGS calculation.
- `POST /api/bundles/expand` — Returns selected bundle components for display.
- `POST /api/cart/current` — Syncs cart state for customer display (SSE).
- `GET /api/admin/sales` — Sales report with COGS from consumption records.
- `GET /api/admin/sales/daily` — Daily order details with per-item COGS.
- `POST /api/debug/recreate-consumptions` — Backfill COGS for orders missing consumption data.
- `GET /api/kitchen/orders` — Kitchen order feed.
- `GET /api/kitchen/stream` — SSE stream for kitchen display.

## Key Files

```
app/admin/pos/page.tsx          — Staff POS (primary interface)
app/products/page.tsx           — Product catalog with selection modal
app/payment/page.tsx            — Payment flow, order creation trigger
app/kitchen/page.tsx            — Kitchen display
context/cartContext.tsx          — Cart state, discount/surcharge logic
context/branchContext.tsx        — Branch selection, X-Branch-Id header
lib/db/init.ts                  — Database schema and connection
lib/db/productService.ts        — Product CRUD
lib/db/recipeService.ts         — Recipe management
lib/db/recursiveProductExpansion.ts — Bundle flattening and price calculation
lib/db/inventoryConsumptionService.ts — COGS recording and calculation
lib/db/branchStockService.ts    — Stock management (source of truth)
lib/db/orderService.ts          — Order queries
lib/receiptGenerator.ts         — HTML receipt generation
scripts/receipt-print-server.js — USB thermal printer server
scripts/raw-print.ps1           — Win32 Print Spooler for ESC/POS
scripts/diagnose-orders.js      — Order COGS diagnostic tool
components/ProductSelectionModal.tsx — Bundle/combo selection UI
components/CashPayment.tsx       — Cash payment with change calculation
components/HoldOrderManager.tsx  — Hold/resume order system
```

## Auth

Simple sessionStorage-based admin auth. No user accounts — staff enters a shared PIN at `/admin`. `sessionStorage.setItem('admin_auth', 'authenticated')` gates admin features.

## Environment Variables (`.env.local`)

```
# WooCommerce (legacy — sync still available but system runs independently)
NEXT_PUBLIC_WC_API_URL=https://coffee-oasis.com.my
WC_CONSUMER_KEY=ck_...
WC_CONSUMER_SECRET=cs_...

# FTP Receipt Upload
FTP_HOST=ftp.coffee-oasis.com.my
FTP_USER=...
FTP_PASSWORD=...
FTP_RECEIPT_PATH=/domains/coffee-oasis.com.my/public_html/receipts
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

# Database backup
copy prisma\dev.db prisma\backup-%date%.db

# Clear build cache
rmdir /s /q .next
npm run build
```
