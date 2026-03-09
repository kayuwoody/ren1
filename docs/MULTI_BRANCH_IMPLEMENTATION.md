# Multi-Branch Support — Implementation Guide

## Context

Coffee Oasis POS is a Next.js 14 (App Router) + SQLite (better-sqlite3) system. It currently operates as a single-branch system. We need to add multi-branch support so that:

1. Multiple physical branches share the same deployment
2. Each branch has independent stock, orders, POs, and consumption records
3. Products, recipes, and materials remain global (shared catalog)
4. Branch context is set at operator login and persists through the session
5. All reports and exports include branch context

**Future phase (NOT in this scope):** Customer-facing ordering (app/website) with branch routing. This work lays the schema foundation for that.

---

## Architecture Decisions

- **Single database, branch-scoped data** — no sync mechanism, no separate instances
- **SQLite stays** — migration to Postgres is a future concern
- **Products/recipes/materials are global** — same menu across all branches
- **Stock quantities are per-branch** — each branch tracks its own inventory
- **branchId is required on all branch-scoped tables** — nullable for migration, but new records must include it
- **Default branch** — existing data gets assigned to a default branch (e.g., "main") during migration

---

## Implementation Steps

### Step 1: Create the Branch Table

**File:** `lib/db/init.ts`

Add a new `Branch` table in `initDatabase()`, BEFORE the other table definitions:

```sql
CREATE TABLE IF NOT EXISTS Branch (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,    -- short code like 'KL1', 'PJ1'
  address TEXT,
  phone TEXT,
  isDefault INTEGER NOT NULL DEFAULT 0,  -- exactly one branch should be default
  isActive INTEGER NOT NULL DEFAULT 1,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Add a seed migration that inserts a default branch if none exists:

```sql
INSERT OR IGNORE INTO Branch (id, name, code, isDefault, isActive)
VALUES ('branch-main', 'Main Branch', 'MAIN', 1, 1);
```

### Step 2: Add branchId to Branch-Scoped Tables

Add `branchId TEXT` column (with migration pattern) to these tables:

| Table | Why |
|-------|-----|
| `Order` | Each branch processes its own orders |
| `OrderItem` | Inherited from Order, but useful for direct queries |
| `InventoryConsumption` | Stock deductions are branch-local |
| `StockCheckLog` | Physical counts are branch-specific |
| `StockCheckLogItem` | Part of stock check |
| `PurchaseOrder` | Each branch orders its own supplies |
| `PurchaseOrderItem` | Part of PO |

**Migration pattern** (follow the existing pattern in `init.ts`):

```typescript
// Migration: Add branchId to Order table
try {
  const tableInfo = db.prepare("PRAGMA table_info(\"Order\")").all() as any[];
  const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
  if (tableInfo.length > 0 && !hasBranchId) {
    console.log('Adding branchId column to Order table...');
    db.exec(`ALTER TABLE "Order" ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
    // Backfill existing records with default branch
    db.exec(`UPDATE "Order" SET branchId = 'branch-main' WHERE branchId IS NULL`);
    console.log('branchId column added to Order table');
  }
} catch (e) {
  // Column already exists
}
```

Repeat this pattern for each table listed above. Add an index on branchId for each:

```sql
CREATE INDEX IF NOT EXISTS idx_order_branch ON "Order"(branchId);
CREATE INDEX IF NOT EXISTS idx_consumption_branch ON InventoryConsumption(branchId);
CREATE INDEX IF NOT EXISTS idx_stock_check_log_branch ON StockCheckLog(branchId);
CREATE INDEX IF NOT EXISTS idx_purchase_order_branch ON PurchaseOrder(branchId);
```

**Do NOT add branchId to:** Product, Material, ProductRecipe, MaterialPriceHistory — these are global catalog data shared across branches.

### Step 3: Per-Branch Stock Tracking

Currently, stock lives directly on `Material.stockQuantity` and `Product.stockQuantity`. For multi-branch, we need per-branch stock.

**Create a new table:**

```sql
CREATE TABLE IF NOT EXISTS BranchStock (
  id TEXT PRIMARY KEY,
  branchId TEXT NOT NULL,
  itemType TEXT NOT NULL,         -- 'material' or 'product'
  itemId TEXT NOT NULL,           -- materialId or productId
  stockQuantity REAL NOT NULL DEFAULT 0,
  lowStockThreshold REAL NOT NULL DEFAULT 0,
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(branchId, itemType, itemId),
  FOREIGN KEY (branchId) REFERENCES Branch(id)
);

CREATE INDEX IF NOT EXISTS idx_branch_stock_branch ON BranchStock(branchId);
CREATE INDEX IF NOT EXISTS idx_branch_stock_item ON BranchStock(itemType, itemId);
```

**Migration:** Seed `BranchStock` from existing `Material.stockQuantity` and `Product.stockQuantity` for the default branch:

```sql
INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold)
SELECT 'bs-mat-' || id, 'branch-main', 'material', id, stockQuantity, lowStockThreshold
FROM Material;

INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold)
SELECT 'bs-prod-' || id, 'branch-main', 'product', id, stockQuantity, 0
FROM Product WHERE manageStock = 1;
```

**Important:** After this migration, the source of truth for stock quantities is `BranchStock`, not the columns on `Material` or `Product`. However, keep the old columns for backward compatibility during the transition — just stop writing to them in favor of `BranchStock`.

### Step 4: Branch Service

**New file:** `lib/db/branchService.ts`

```typescript
export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Functions needed:
// - getAllBranches(): Branch[]
// - getBranch(id: string): Branch | null
// - getDefaultBranch(): Branch
// - createBranch(data: { name, code, address?, phone? }): Branch
// - updateBranch(id: string, data: Partial<Branch>): Branch
// - setDefaultBranch(id: string): void  // unsets previous default
```

**New file:** `lib/db/branchStockService.ts`

```typescript
// Functions needed:
// - getBranchStock(branchId: string, itemType: string, itemId: string): number
// - updateBranchStock(branchId: string, itemType: string, itemId: string, quantity: number): void
// - adjustBranchStock(branchId: string, itemType: string, itemId: string, delta: number): void  // increment/decrement
// - getLowStockItems(branchId: string): BranchStock[]
// - initBranchStockForNewBranch(branchId: string): void  // creates zero-stock entries for all items
```

### Step 5: Branch Context in the Frontend

**New file:** `context/branchContext.tsx`

```typescript
// BranchContext provides:
// - currentBranch: Branch | null
// - setBranch(branchId: string): void
// - branches: Branch[]  (all active branches)
//
// Persistence: sessionStorage key 'current_branch_id'
// On mount: load from sessionStorage, fallback to default branch
// On change: update sessionStorage
```

**Wrap the app** in `BranchProvider` at the layout level (`app/layout.tsx` or `app/admin/layout.tsx`).

### Step 6: Branch Selector UI

**Add to the admin login/dashboard page** (`app/admin/page.tsx`):

After password authentication, show a branch selector if more than one active branch exists. Store the selection in sessionStorage.

**Add a branch indicator** to the admin layout header — show current branch name/code so operators always know which branch they're operating as.

### Step 7: Update Services to Accept branchId

These services need a `branchId` parameter added to their key functions:

#### `lib/db/inventoryConsumptionService.ts`
- `recordProductSale()` — pass branchId, deduct from `BranchStock` instead of `Material.stockQuantity`
- All consumption records get tagged with branchId

#### `lib/db/stockCheckLogService.ts`
- Stock check creation — pass branchId
- Stock check queries — filter by branchId
- Stock adjustments — update `BranchStock` instead of direct Material/Product columns

#### `lib/db/purchaseOrderService.ts`
- PO creation — pass branchId
- PO listing — filter by branchId
- PO receiving — update `BranchStock` for the PO's branch

#### `lib/db/materialService.ts`
- `updateMaterialStock()` — update `BranchStock` instead of `Material.stockQuantity`
- `getLowStockMaterials()` — query `BranchStock` for the current branch

#### `lib/db/productService.ts`
- Stock-related functions — use `BranchStock`

### Step 8: Update API Routes

Every API route that deals with branch-scoped data needs to:

1. Accept `branchId` from the request (query param, body field, or header `X-Branch-Id`)
2. Pass it through to the service layer
3. Filter responses by branch

**Key routes to update:**

| Route | Change |
|-------|--------|
| `POST /api/orders/create-with-payment` | Include branchId in order creation |
| `GET /api/admin/orders` | Filter by branchId |
| `POST /api/orders/consumption` | Pass branchId to recordProductSale |
| `GET /api/admin/stock-check` | Filter stock by branch |
| `POST /api/admin/stock-check` | Tag check with branchId, update BranchStock |
| `GET /api/purchase-orders` | Filter by branchId |
| `POST /api/purchase-orders` | Include branchId |
| `POST /api/purchase-orders/[id]/receive` | Update BranchStock for correct branch |
| `GET /api/admin/daily-stats` | Filter by branchId |
| `GET /api/admin/sales` | Filter by branchId |
| `GET /api/admin/sales/daily` | Filter by branchId |
| `GET /api/admin/products-sold` | Filter by branchId |
| `GET /api/admin/materials` | Include BranchStock quantities |
| `GET /api/products` | Include BranchStock quantities for current branch |

**Recommended pattern:** Use a header `X-Branch-Id` sent by the frontend on every request. Create a helper:

```typescript
// lib/api/branchHelper.ts
export function getBranchIdFromRequest(request: Request): string {
  const branchId = request.headers.get('X-Branch-Id');
  if (!branchId) {
    // Fallback to default branch
    return getDefaultBranch().id;
  }
  return branchId;
}
```

### Step 9: Update Frontend Pages

These pages need to pass the current branch context in API calls:

- `app/admin/pos/page.tsx` — orders created with branchId
- `app/admin/orders/page.tsx` — filter orders by branch
- `app/admin/sales/page.tsx` — filter by branch
- `app/admin/sales/daily/page.tsx` — filter by branch
- `app/admin/materials/page.tsx` — show branch-specific stock quantities
- `app/admin/stock-check/page.tsx` — branch-scoped stock checks
- `app/admin/purchase-orders/page.tsx` — branch-scoped POs
- `app/admin/purchase-orders/create/page.tsx` — tag PO with branch

**Pattern:** Create a custom hook or extend the branch context to provide a fetch wrapper that auto-includes the `X-Branch-Id` header:

```typescript
// In branchContext or a separate hook
function useBranchFetch() {
  const { currentBranch } = useBranch();
  return (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-Branch-Id': currentBranch?.id || '',
      },
    });
  };
}
```

### Step 10: Branch Management Admin Page

**New page:** `app/admin/branches/page.tsx`

Simple CRUD for branches:
- List all branches (name, code, address, active status)
- Add new branch
- Edit branch details
- Activate/deactivate branch
- Set default branch

**New API routes:**
- `GET /api/admin/branches` — list all branches
- `POST /api/admin/branches` — create branch
- `PUT /api/admin/branches/[id]` — update branch
- `DELETE /api/admin/branches/[id]` — deactivate (soft delete via isActive flag)

### Step 11: Receipt and PDF Updates

Update these to include branch info:
- `lib/receiptGenerator.ts` — add branch name/address to receipt header
- `api/purchase-orders/[id]/pdf` — add branch info to PO PDFs
- `api/admin/stock-check/pdf` — add branch info to stock check PDFs

---

## Tables Scoping Summary

| Table | Scope | branchId? |
|-------|-------|-----------|
| Branch | N/A | N/A (is the branch table) |
| BranchStock | Per-branch | Yes |
| Product | Global | No |
| Material | Global | No |
| ProductRecipe | Global | No |
| MaterialPriceHistory | Global | No |
| Order | Per-branch | Yes |
| OrderItem | Per-branch | Yes (inherited) |
| InventoryConsumption | Per-branch | Yes |
| StockCheckLog | Per-branch | Yes |
| StockCheckLogItem | Per-branch | Yes (inherited) |
| PurchaseOrder | Per-branch | Yes |
| PurchaseOrderItem | Per-branch | Yes (inherited) |

---

## Migration Safety

- All `branchId` columns are added as nullable with `ALTER TABLE ADD COLUMN`
- Existing records are backfilled with `'branch-main'` (the default branch ID)
- `BranchStock` is seeded from existing `Material.stockQuantity` and `Product.stockQuantity`
- Old stock columns on Material/Product are kept but become stale — services read from `BranchStock`
- The system works with a single branch (backward compatible) — branch selector only shows if 2+ active branches exist

---

## Files to Create

1. `lib/db/branchService.ts` — Branch CRUD
2. `lib/db/branchStockService.ts` — Per-branch stock operations
3. `context/branchContext.tsx` — React context for current branch
4. `app/admin/branches/page.tsx` — Branch management UI
5. `app/api/admin/branches/route.ts` — Branch list + create API
6. `app/api/admin/branches/[id]/route.ts` — Branch update API
7. `lib/api/branchHelper.ts` — Extract branchId from requests

## Files to Modify

1. `lib/db/init.ts` — Branch table, BranchStock table, branchId migrations
2. `lib/db/inventoryConsumptionService.ts` — branchId param, use BranchStock
3. `lib/db/stockCheckLogService.ts` — branchId param, use BranchStock
4. `lib/db/purchaseOrderService.ts` — branchId param
5. `lib/db/purchaseOrderSchema.ts` — branchId on PO tables
6. `lib/db/materialService.ts` — stock functions use BranchStock
7. `lib/db/productService.ts` — stock functions use BranchStock
8. `context/cartContext.tsx` — include branchId in cart operations
9. `app/admin/page.tsx` — branch selector after login
10. `app/admin/pos/page.tsx` — pass branchId on order creation
11. `app/admin/materials/page.tsx` — show branch stock
12. `app/admin/stock-check/page.tsx` — branch-scoped checks
13. `app/admin/purchase-orders/page.tsx` — branch filter
14. `app/admin/purchase-orders/create/page.tsx` — branch tag
15. `app/admin/sales/page.tsx` — branch filter
16. `app/admin/sales/daily/page.tsx` — branch filter
17. `app/admin/orders/page.tsx` — branch filter
18. `app/api/orders/create-with-payment/route.ts` — accept branchId
19. `app/api/orders/consumption/route.ts` — pass branchId
20. `app/api/admin/orders/route.ts` — filter by branch
21. `app/api/admin/stock-check/route.ts` — branch scope
22. `app/api/purchase-orders/route.ts` — branch scope
23. `app/api/admin/daily-stats/route.ts` — branch filter
24. `app/api/admin/sales/route.ts` — branch filter
25. `app/api/admin/products-sold/route.ts` — branch filter
26. `lib/receiptGenerator.ts` — branch info on receipts
27. `app/layout.tsx` or `app/admin/layout.tsx` — wrap with BranchProvider

---

## Implementation Order

1. **Schema first** — Branch table, BranchStock table, branchId migrations (Step 1-3)
2. **Service layer** — branchService, branchStockService (Step 4)
3. **API helper** — branchHelper.ts (Step 8)
4. **Update existing services** — add branchId params (Step 7)
5. **Update API routes** — accept and pass branchId (Step 8)
6. **Frontend context** — branchContext (Step 5)
7. **Branch selector UI** — admin page integration (Step 6)
8. **Update frontend pages** — pass branch context (Step 9)
9. **Branch management page** — CRUD UI (Step 10)
10. **Receipts and PDFs** — add branch info (Step 11)

---

## Testing Checklist

- [ ] App starts with single branch (backward compatible)
- [ ] Default branch auto-created on first run
- [ ] Existing data backfilled with default branchId
- [ ] Can create a second branch
- [ ] Branch selector appears when 2+ branches exist
- [ ] POS orders tagged with correct branchId
- [ ] Stock deductions affect correct branch's BranchStock
- [ ] Stock check shows branch-specific quantities
- [ ] Purchase orders scoped to branch
- [ ] Sales reports filter by branch
- [ ] Receipts show branch name/address
- [ ] Switching branches in UI changes all data views
- [ ] Products/recipes/materials remain shared across branches

---

## Code Review Findings (March 2026)

Review of implementation on branch `origin/claude/fork-multi-branch-kR5aM` (22 files changed, 938 insertions) against this spec. **Coverage: ~55-60%.**

### What's Implemented (on fork branch)

#### Schema & Infrastructure — Complete
- Branch table, BranchStock table, branchId migrations on all 7 scoped tables
- Indexes, seeding, default branch creation
- `branchService.ts` — full CRUD, `setDefaultBranch()` uses `db.transaction()`
- `branchStockService.ts` — `getBranchStock`, `updateBranchStock`, `adjustBranchStock`, `getLowStockItems`, `initBranchStockForNewBranch`
- `branchHelper.ts` — `getBranchIdFromRequest()` with branch validation and fallback to default

#### Services — Partially Updated
- **`inventoryConsumptionService.ts`** — `recordProductSale()` accepts optional `branchId`, uses `adjustBranchStock()` for deductions
- **`purchaseOrderService.ts`** — `createPurchaseOrder()` accepts `branchId`, `markPurchaseOrderReceived()` reads `order.branchId`, calls `adjustBranchStock()`
- **`stockCheckLogService.ts`** — `createStockCheckLog()` accepts optional `branchId`, defaults to `'branch-main'`

#### API Routes — Partially Updated
- `GET/POST /api/admin/stock-check` — uses `getBranchIdFromRequest()`, reads/writes BranchStock
- `POST /api/orders/consumption` — passes branchId to `recordProductSale()`
- `GET/POST /api/purchase-orders` — filters by branchId on GET, tags on POST
- `POST /api/receipts/generate` — includes branch name/address/phone in receipt
- `GET/POST /api/admin/branches` + `PUT /api/admin/branches/[id]` — new CRUD routes

#### Frontend — Partially Updated
- `context/branchContext.tsx` — React context with `branchFetch()` helper (adds `X-Branch-Id` header), sessionStorage persistence
- `app/layout.tsx` — wraps app in `BranchProvider` (nested inside `CartProvider`)
- `app/admin/page.tsx` — branch selector dropdown (shows when 2+ branches), displays current branch name
- `app/admin/branches/page.tsx` — new branch management CRUD page
- `app/admin/stock-check/page.tsx` — uses `branchFetch()` for all API calls
- `app/admin/purchase-orders/page.tsx` — uses `branchFetch()` for list/actions
- `app/admin/purchase-orders/create/page.tsx` — includes `branchId` in PO creation
- `lib/receiptGenerator.ts` — accepts `branch?: BranchInfo`, renders in receipt header

### Major Gaps (not updated on fork)

#### 9 API routes still global (no branchId):
- `POST /api/orders/create-with-payment` — orders created without branch tag
- `GET /api/admin/orders` — returns all orders globally
- `GET /api/admin/sales` — aggregates all sales, no branch filter
- `GET /api/admin/sales/daily` — same
- `GET /api/admin/daily-stats` — same
- `GET /api/admin/products-sold` — same
- `GET /api/admin/materials` — returns Material.stockQuantity (not BranchStock)
- `GET /api/products` — returns Product.stockQuantity (not BranchStock)
- `GET /api/products/[id]/cogs` — COGS calculation unscoped

#### 5 frontend pages untouched:
- `app/admin/pos/page.tsx` — POS page doesn't use `branchFetch()`
- `app/admin/orders/page.tsx` — orders page unfiltered
- `app/admin/sales/page.tsx` — sales reports unfiltered
- `app/admin/sales/daily/page.tsx` — daily sales unfiltered
- `app/admin/materials/page.tsx` — shows global stock, not branch stock

#### 2 services never modified:
- `materialService.ts` — all stock functions write to `Material.stockQuantity` only, no BranchStock awareness
- `productService.ts` — all stock functions write to `Product.stockQuantity` only, no BranchStock awareness

#### Other gaps:
- `cartContext.tsx` — not updated to include branchId
- PO PDF (`purchase-orders/[id]/pdf`) — no branch info
- Stock check PDF (`admin/stock-check/pdf`) — no branch info
- Branch indicator only on dashboard, not in a shared admin header

### Bugs Found

1. **Legacy column corruption** — When a sale happens, `inventoryConsumptionService` calls both `adjustBranchStock()` (correct) and `updateMaterialStock()` / raw `UPDATE Product SET stockQuantity` (legacy). The legacy column gets overwritten with the branch-specific value. In multi-branch, `Material.stockQuantity` would reflect whichever branch sold last — not total stock. Same issue in `purchaseOrderService.markPurchaseOrderReceived()`.

2. **Dual-write without transaction** — The BranchStock update and legacy column update are separate operations with no transaction wrapper. A crash between them causes data divergence.

3. **PO route allows client branchId override** — `POST /api/purchase-orders` uses `body.branchId = body.branchId || branchId` which lets a client override the branch via body field. Should enforce server-side: `body.branchId = branchId`.

4. **Redundant branchId passing on PO create** — `app/admin/purchase-orders/create/page.tsx` sends branchId in both the request body AND via the `X-Branch-Id` header (through `branchFetch()`). The API should use one source, not both.

5. **Fragile positional args** — `recordProductSale(orderId, ..., 0, '', branchId)` passes branchId as a trailing positional arg through many empty placeholders. Should be an options object.

### Open Questions Requiring Decision

1. **Dual-write vs BranchStock-only**: After migration, do we keep writing to `Material.stockQuantity` and `Product.stockQuantity` for backward compatibility, or stop writing to them entirely? The fork currently does both, which causes Bug #1. Spec says "stop writing" but this breaks any code path we miss.

2. **WooCommerce multi-branch strategy**: Current code syncs stock to/from a single WooCommerce instance. Options:
   - Single WC, sum of all branch stock = WC stock
   - Single WC, only default branch syncs to WC
   - Separate WC instances per branch (major rearchitecture)

3. **PO number scope**: Should PO numbers be globally unique or branch-scoped? (e.g., `PO-2024-001` globally vs `KL1-PO-2024-001`)

4. **Timezone per branch**: Currently hardcoded UTC+8 — if branches span timezones, this needs parameterizing

5. **Suppliers scope**: Should suppliers be global or per-branch? Current `getSuppliers()` aggregates globally

6. **Cart localStorage isolation**: Should switching branches clear the cart, or maintain separate carts per branch?

### Spec Accuracy Assessment

The spec is **largely accurate** and well-structured. Key corrections/additions needed:

1. **Spec Step 8 route table is incomplete** — missing routes that also need branch scoping:
   - `GET /api/admin/stock-check/logs` (pagination endpoint)
   - `GET /api/admin/stock-check/logs/[id]` (single log detail)
   - `GET /api/admin/stock-check/pdf` (PDF generation)
   - `GET /api/purchase-orders/[id]/pdf` (PO PDF)
   - `GET /api/purchase-orders/[id]/csv` (PO CSV export)
   - `PATCH /api/purchase-orders/[id]` (PO update)
   - `DELETE /api/purchase-orders/[id]` (PO delete)
   - `POST /api/purchase-orders/[id]/receive` (PO receive)
   - `GET /api/purchase-orders/items` (items for PO creation form)
   - `GET /api/purchase-orders/suppliers` (supplier list)
   - `GET /api/admin/customers` (used by orders page)
   - `GET /api/products/[id]/cogs` (COGS calculation in POS)
   - `POST /api/cart/current` (cart sync)
2. **Spec doesn't address dual-write problem** — the legacy column corruption is the most critical bug and needs an explicit strategy in the spec
3. **Spec doesn't address inconsistent stock write patterns** — products use raw SQL in some places, materials use service functions; should be standardized before adding branch logic
4. **`materialService.ts` and `productService.ts` are the hardest remaining work** — they are the source-of-truth services and touching them affects every consumer
