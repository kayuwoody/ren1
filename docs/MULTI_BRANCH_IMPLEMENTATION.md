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

This section captures findings from reviewing the actual codebase against the spec above. Findings are grouped by layer.

### Service Layer Findings

#### `lib/db/inventoryConsumptionService.ts`
- **6 exported functions**: `recordProductSale`, `getOrderConsumptions`, `getProductConsumptions`, `getMaterialConsumptions`, `getConsumptionSummary`, `calculateProductCOGS`
- **Direct stock writes**:
  - `deductMaterialStock()` calls `updateMaterialStock()` on global `Material.stockQuantity`
  - `deductLocalProductStock()` writes raw SQL: `UPDATE Product SET stockQuantity = ? WHERE id = ?`
  - Inconsistent pattern — materials use a service function, products use raw SQL
- **All functions lack branchId**: `recordProductSale()` is the main entry point and has no branch context; all consumption records are inserted without branchId
- **All query functions are global**: `getOrderConsumptions`, `getProductConsumptions`, `getMaterialConsumptions`, `getConsumptionSummary` — no branch filtering
- **Refactor opportunity**: Stock deduction logic is duplicated across three functions with similar patterns

#### `lib/db/stockCheckLogService.ts`
- **6 exported functions**: `createStockCheckLog`, `getAllStockCheckLogs`, `getStockCheckLogs`, `getStockCheckLogWithItems`, `getItemStockHistory`, `deleteStockCheckLog`
- **No direct stock writes** — this is an audit log only
- **All functions lack branchId**: No branch filtering on any query, no branchId on insert
- **No access control**: Any user can view/delete any branch's stock check logs

#### `lib/db/purchaseOrderService.ts`
- **8 exported functions**: `createPurchaseOrder`, `getAllPurchaseOrders`, `getPurchaseOrder`, `getPurchaseOrderByNumber`, `updatePurchaseOrder`, `markPurchaseOrderReceived`, `updatePurchaseOrderItems`, `deletePurchaseOrder`, plus `getSuppliers`
- **Direct stock writes in `markPurchaseOrderReceived()`**:
  - `UPDATE Material SET stockQuantity = stockQuantity + ? WHERE id = ?`
  - `UPDATE Product SET stockQuantity = stockQuantity + ? WHERE id = ?`
  - Also calls `addWooProductStock()` for WC-linked products
- **CRITICAL**: `markPurchaseOrderReceived()` has no branch context — which branch's inventory gets the stock?
- **PO number generation**: May conflict across branches if not branch-scoped
- **`getSuppliers()`**: Aggregates from ALL materials/products globally

#### `lib/db/materialService.ts`
- **10 exported functions**: `upsertMaterial`, `updateMaterialPrice`, `getMaterial`, `getAllMaterials`, `getMaterialsByCategory`, `listMaterials`, `deleteMaterial`, `getMaterialPriceHistory`, `updateMaterialStock`, `getLowStockMaterials`
- **Direct stock writes**: `updateMaterialStock()` updates `Material.stockQuantity` directly; `upsertMaterial()` writes stockQuantity on both insert and update
- **`getLowStockMaterials()`**: Returns global low-stock items — needs branch scoping
- **Spec question**: Materials are global catalog items, but stock is per-branch. The `upsertMaterial()` function writes to the global stockQuantity column — after migration, this column becomes stale. Need to decide: keep writing to both (dual-write) or stop writing to global column?

#### `lib/db/productService.ts`
- **9 exported functions**: `getProduct`, `getProductByWcId`, `getProductBySku`, `getAllProducts`, `getProductsByCategory`, `upsertProduct`, `updateProductCost`, `deleteProduct`, `syncProductFromWooCommerce`
- **Direct stock writes**: `upsertProduct()` writes stockQuantity; `syncProductFromWooCommerce()` has complex stock preservation logic
- **WooCommerce sync concern**: `syncProductFromWooCommerce()` assumes single WC instance and single source of truth for stock — multi-branch may need separate WC stock per branch or central WC with branch mapping
- **Stock preservation logic** (line ~182): Comment says "SQLite is updated when orders are paid (via consumption API)" — but that consumption API has no branch context

### API Route Findings

#### `POST /api/orders/create-with-payment`
- Walk-in order detection hardcoded to specific POS customer ID via `getPosCustomerId()`
- Single store assumption — no branch routing
- Needs branchId in request body or header

#### `POST /api/orders/consumption`
- Calls `recordProductSale()` — which lacks branchId (see service findings above)
- Has bundle support (`_is_bundle`, `_bundle_mandatory`, `_bundle_optional` metadata)
- No branch context passed through

#### `GET /api/admin/orders`
- Hardcoded: `status: 'any'`, `orderby: 'date'`, `order: 'desc'`
- Fetches ALL orders globally — no branch filter
- No query params at all currently

#### `GET/POST /api/admin/stock-check` — **HIGHEST PRIORITY**
- **GET**: Reads `product.stockQuantity` and `material.stockQuantity` directly (not from BranchStock)
- **POST**: Updates `Product.stockQuantity` via raw SQL, calls `updateMaterialStock()`, syncs to WooCommerce
- Completely single-branch — 5 different API calls from the frontend all need branch context

#### `GET /api/admin/daily-stats`
- Hardcoded UTC+8 timezone — no geographic/branch context
- No query params, no branch filtering

#### `GET /api/admin/sales`
- Accepts: `range` (7days|30days|90days|mtd|ytd|all), `start`, `end`, `hideStaffMeals`
- Reads COGS from consumption records globally — no branch filter
- Hardcoded UTC+8 timezone

#### `GET /api/admin/sales/daily`
- Accepts: `date` (YYYY-MM-DD)
- Same global aggregation pattern as `/api/admin/sales`

#### `GET/POST /api/purchase-orders`
- GET returns all POs globally, POST creates without branchId
- Stock update happens on receive (separate endpoint)

#### `POST /api/purchase-orders/[id]/receive`
- Calls `markPurchaseOrderReceived()` — which updates global stock (see service findings)
- **CRITICAL**: No branch context for inventory update

#### Previously reviewed routes (from earlier agent):
- `GET /api/admin/products-sold` — global aggregation, no branch filter, reads COGS from global consumption
- `GET /api/admin/materials` — returns global materials list, stockQuantity from Material table
- `GET /api/products` — returns products with stockQuantity from Product table (not BranchStock)
- `GET /api/admin/stock-check/pdf` — reads from `getAllProducts()` and `getAllMaterials()` globally
- `GET /api/purchase-orders/[id]/pdf` — no branch info in PDF output

### Frontend Findings

#### Data Fetching Pattern
- **All pages use raw `fetch()`** — no shared API client, no SWR, no custom hooks
- This means branch context injection requires updating every single fetch call individually
- **Recommendation from spec is correct**: Create a `useBranchFetch()` hook or fetch wrapper

#### Key Frontend Files

| File | API Calls | Branch Impact | Complexity |
|------|-----------|---------------|------------|
| `context/cartContext.tsx` | 1 (POST /api/cart/current) | Cart sync needs branchId; localStorage key 'cart' could scope to branch | Medium |
| `app/admin/page.tsx` | 2 (heartbeat, daily-stats) | Both need branch context; auto-refreshes every 30s | Low-Medium |
| `app/layout.tsx` | 0 (wraps CartProvider) | Add BranchProvider here | Very Low |
| `app/admin/pos/page.tsx` | 1 (COGS endpoint) | COGS calculation needs branch context for stock | High complexity |
| `app/admin/materials/page.tsx` | 1 (materials list) | Stock quantities must be branch-specific | Medium |
| `app/admin/stock-check/page.tsx` | **5 API calls** | All 5 must be branch-scoped; highest-touch frontend file | Very High |
| `app/admin/purchase-orders/page.tsx` | **6+ API calls** | List, CSV, PDF, receive, update, delete all need branch | High |
| `app/admin/purchase-orders/create/page.tsx` | 3 (items, suppliers, create) | PO creation must be branch-tagged | High |
| `app/admin/sales/page.tsx` | 1 (sales with date range) | COGS/profit must be branch-scoped | Medium-High |
| `app/admin/orders/page.tsx` | 2 (orders, customers) | Orders must filter by branch | High |
| `lib/receiptGenerator.ts` | 0 (HTML template) | Add branch name/address to header | Low |

#### No admin-specific layout found
- There is no `app/admin/layout.tsx` — the root `app/layout.tsx` wraps `CartProvider`
- Branch selector and BranchProvider would need to be added at root layout or a new admin layout

### Open Questions Requiring Decision

1. **Dual-write vs BranchStock-only**: After migration, do we keep writing to `Material.stockQuantity` and `Product.stockQuantity` for backward compatibility, or stop writing to them entirely? (Spec says "stop writing" but this breaks any code path we miss)

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

1. **Spec lists `app/admin/sales/daily/page.tsx`** — verify this file exists (the agent found `/api/admin/sales/daily/route.ts` but the page may be at a different path)
2. **Spec Step 8 route table is incomplete** — missing routes:
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
3. **Spec doesn't mention `app/admin/layout.tsx` doesn't exist** — assumes wrapping at admin layout level but only root layout exists
4. **Spec underestimates stock-check complexity** — 5 API calls from frontend, highest-touch file for migration
5. **Spec doesn't address inconsistent stock write patterns** — products use raw SQL in some places, materials use service functions; should be standardized before adding branch logic
