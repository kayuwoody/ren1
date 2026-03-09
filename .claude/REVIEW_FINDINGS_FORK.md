# Code Review Findings — Branch `claude/fork-multi-branch-kR5aM`

**Reviewer:** Code Review Agent
**Date:** 2026-03-09
**Commits reviewed:** `74d8c58` (Complete multi-branch implementation gaps) and `158dc21` (Implement multi-branch support)
**Diff base:** `origin/claude/pos-multi-branch-support-YS4Qr`
**Files changed:** 38 files, +1168 / -333 lines

---

## Summary Table

| Task | Status | Issues |
|------|--------|--------|
| 1A: inventoryConsumptionService.ts | **PASS** | WC functions removed, branchId threaded through recursion, BranchStock used |
| 1B: materialService.ts | **PARTIAL** | `updateMaterialStock()` NOT removed; `getLowStockMaterials()` NOT redirected to BranchStock; `upsertMaterial()` does NOT create BranchStock entries for new materials |
| 1C: productService.ts | **PARTIAL** | `upsertProduct()` still writes `stockQuantity` to Product table; `syncProductFromWooCommerce()` preserves local stock but still writes to legacy column |
| 1D: purchaseOrderService.ts | **PASS** | Uses `adjustBranchStock()` only, calls `syncLegacyStockColumns()` after |
| 2: API Routes | **PARTIAL** | 5 of 9 routes still fetch from WooCommerce instead of local DB (CRITICAL architectural violation) |
| 3: Frontend Pages | **PASS** | All 5 pages use `branchFetch()`; `branchContext.tsx` exists and works |
| 4: PO Number Branch Prefix | **PASS** | `generatePONumber(branchCode)` implemented with correct format |
| 5: PDFs and Receipts | **PARTIAL** | PO PDF and receipts have branch info; stock-check PDF does NOT |
| 6: Branch Indicator | **PARTIAL** | Branch selector on dashboard page only, NOT in persistent admin header/layout |
| 7: Legacy Column Aggregation | **PASS** | `syncLegacyStockColumns()` exists, called after PO receiving |
| 8: Schema (timezone) | **PASS** | Migration in `lib/db/init.ts` adds timezone column with correct default |

---

## Detailed Findings

### Task 1A: `inventoryConsumptionService.ts` — PASS

- `recordProductSale()` refactored to options object with required `branchId`: **YES** (line ~36-46, `RecordProductSaleOptions` interface)
- `deductMaterialStock()` uses `adjustBranchStock()`: **YES** (line ~263)
- `deductLocalProductStock()` uses `adjustBranchStock()`: **YES** (line ~275)
- `deductWooProductStock()` removed: **YES**
- `logStockComparison()` removed: **YES**
- `branchId` in all INSERT statements: **YES** (17 values in each INSERT, branchId is the last)
- `branchId` threaded through recursive calls: **YES** (passed to `_recordProductSaleInternal`)
- WC imports removed: **YES** — no `wcApi` import. Only benign comment references to "WooCommerce ID" remain.

### Task 1B: `materialService.ts` — PARTIAL (3 issues)

**Issue 1 (Medium):** `updateMaterialStock()` is NOT removed. It still exists at line ~239 and directly writes to `Material.stockQuantity`. It is still called from `app/api/admin/stock-check/route.ts`.

**Issue 2 (Medium):** `getLowStockMaterials()` is NOT redirected to BranchStock. It still queries `Material.stockQuantity <= lowStockThreshold` on the legacy column.

**Issue 3 (Low):** `upsertMaterial()` does NOT create BranchStock entries when inserting a new material. The spec says: "When a new material is created, also insert a BranchStock row for each active branch."

### Task 1C: `productService.ts` — PARTIAL (1 issue)

**Issue (Low-Medium):** `upsertProduct()` still writes `stockQuantity` to the Product table on both INSERT and UPDATE paths. The spec says "For reads: anywhere that reads `Product.stockQuantity` for display purposes should instead query BranchStock." The writes in `upsertProduct` are for catalog sync which is somewhat acceptable, but `syncProductFromWooCommerce()` still calls `upsertProduct` which writes stock. Given `syncLegacyStockColumns()` exists as a safety net, this is not critical but deviates from the "BranchStock is sole source of truth" principle.

### Task 1D: `purchaseOrderService.ts` — PASS

- `markPurchaseOrderReceived()` uses `adjustBranchStock()` for each item: **YES**
- No legacy `updateMaterialStock()` calls: **YES**
- No WC sync calls: **YES**
- Calls `syncLegacyStockColumns()` after receiving: **YES**
- `branchId` comes from `order.branchId` with fallback to `'branch-main'`: **YES**

### Task 2: API Routes — PARTIAL (CRITICAL architectural issue)

**CRITICAL: WC-based filtering instead of local DB queries**

The following 5 routes fetch orders from WooCommerce and then filter by `_branch_id` meta_data in JavaScript, instead of querying local SQLite with `WHERE branchId = ?`:

| Route | WC-based? | Issue |
|-------|-----------|-------|
| `app/api/admin/orders/route.ts` | **YES** | Calls `fetchAllWooPages('orders')`, filters by `getMetaValue(order.meta_data, '_branch_id')` |
| `app/api/admin/sales/route.ts` | **YES** | Same WC fetch + meta_data filter pattern |
| `app/api/admin/sales/daily/route.ts` | **YES** | Same pattern |
| `app/api/admin/daily-stats/route.ts` | **YES** | Same pattern |
| `app/api/admin/products-sold/route.ts` | **YES** | Same pattern |

This violates the architectural decision: **"WooCommerce is being deprecated. Routes should query local SQLite with WHERE branchId."** The agent tagged WC orders with `_branch_id` meta_data (in the create-with-payment route) and implemented client-side filtering of WC responses. This is the opposite of what was intended.

**Routes that ARE correctly using local DB:**

| Route | Status |
|-------|--------|
| `app/api/admin/materials/route.ts` | **PASS** — JOINs Material with BranchStock, uses `WHERE bs.branchId = ?` |
| `app/api/products/route.ts` | **PASS** — Returns `getBranchStock()` for stock quantities |
| `app/api/orders/create-with-payment/route.ts` | **PARTIAL** — Gets branchId but only tags WC meta_data; does not INSERT into local Order table |
| `app/api/products/[productId]/cogs/route.ts` | **N/A** — COGS is recipe-based, no branch scoping needed per spec |

**Issue with create-with-payment:** This route tags WC orders with `_branch_id` meta_data but does not insert into a local Order table with branchId. The spec says "Include `branchId` in the Order INSERT" and "Include `branchId` in all OrderItem INSERTs." It appears the local Order table may not exist yet, which is a gap.

### Task 3: Frontend Pages — PASS

All 5 pages confirmed using `branchFetch()`:

- `app/admin/pos/page.tsx` — imports `useBranch`, uses `branchFetch` for COGS calls
- `app/admin/orders/page.tsx` — uses `branchFetch('/api/admin/orders')`
- `app/admin/sales/page.tsx` — uses `branchFetch(url)`
- `app/admin/sales/daily/page.tsx` — uses `branchFetch(url)`
- `app/admin/materials/page.tsx` — uses `branchFetch(url)`

`context/branchContext.tsx` exists with `BranchProvider`, `useBranch()`, `branchFetch()`, and sessionStorage persistence.

### Task 4: PO Number Branch Prefix — PASS

`generatePONumber(branchCode)` in `lib/db/purchaseOrderSchema.ts`:
- Accepts `branchCode` parameter (defaults to `'MAIN'`)
- Format: `{branchCode}-PO-{year}-{month}-{sequence}` (e.g., `MAIN-PO-2026-03-0001`)
- Sequence query uses `LIKE '${prefix}%'` to avoid collisions across branches
- Caller `createPurchaseOrder()` looks up branch code from branchId

### Task 5: PDFs and Receipts — PARTIAL (1 issue)

- **PO PDF** (`app/api/purchase-orders/[id]/pdf/route.ts`): **PASS** — Looks up branch via `getBranch(purchaseOrder.branchId)`, includes branch name/address in header
- **Receipts** (`lib/receiptGenerator.ts`): **PASS** — Accepts `BranchInfo` parameter, shows branch name, address, phone in receipt header
- **Receipt generation route** (`app/api/receipts/generate/route.ts`): **PASS** — Gets branchId from request, looks up branch, passes to generator

**Issue (Medium):** Stock check PDF (`app/api/admin/stock-check/pdf/route.ts`) does NOT include any branch info. No `branchId` parameter, no branch lookup, no branch name in the PDF header.

### Task 6: Branch Indicator in Admin Header — PARTIAL

**Issue (Medium):** The branch selector/indicator exists only on `app/admin/page.tsx` (the dashboard). There is NO `app/admin/layout.tsx` file. The global `app/layout.tsx` wraps everything in `BranchProvider` but does not show a branch badge. The `components/HeaderNav.tsx` does not reference `useBranch` or display the current branch.

The spec says: "Show the current branch name/code in the admin layout header so operators always know which branch they're on." This is only partially done — visible on dashboard, invisible on all other admin pages.

### Task 7: Legacy Column Aggregation — PASS

- `syncLegacyStockColumns()` exists in `lib/db/branchStockService.ts` with correct SQL (UPDATE Material/Product SET stockQuantity = SUM of BranchStock)
- Called after PO receiving in `markPurchaseOrderReceived()`
- NOT called after stock checks (see bug section)
- NOT called on dashboard load or periodically

### Task 8: Schema — PASS

- Migration in `lib/db/init.ts` adds `timezone TEXT DEFAULT 'Asia/Kuala_Lumpur'` to Branch table
- Uses PRAGMA table_info check before ALTER TABLE
- Wrapped in try/catch

---

## Critical Issues

### CRITICAL-1: Order/Sales routes query WooCommerce instead of local SQLite

**Files:** `app/api/admin/orders/route.ts`, `app/api/admin/sales/route.ts`, `app/api/admin/sales/daily/route.ts`, `app/api/admin/daily-stats/route.ts`, `app/api/admin/products-sold/route.ts`

These 5 routes fetch all orders from WooCommerce via `fetchAllWooPages()` and then filter by `_branch_id` meta_data in JavaScript. The architectural decision explicitly states WooCommerce is being deprecated and routes should query local SQLite with `WHERE branchId = ?`. This means:
1. These routes depend on WC being available (fragile)
2. Branch filtering happens client-side after fetching ALL orders (inefficient)
3. The `_branch_id` meta_data tagging only happens for NEW orders created after this change

**Recommendation:** These routes need to be rewritten to query a local Order table (with branchId column) instead of WooCommerce.

### CRITICAL-2: `create-with-payment` route does not INSERT into local DB

**File:** `app/api/orders/create-with-payment/route.ts`

This route creates orders in WooCommerce and tags them with `_branch_id` meta_data, but does not insert into a local Order/OrderItem table. Without local order storage, the order/sales routes cannot be migrated away from WC.

### CRITICAL-3: Stock check still writes to legacy columns AND WooCommerce

**File:** `app/api/admin/stock-check/route.ts`

The stock check POST handler:
- Calls `updateMaterialStock()` (writes to `Material.stockQuantity` legacy column)
- Calls `db.prepare('UPDATE Product SET stockQuantity = ?')` (writes to `Product.stockQuantity` legacy column)
- Calls `wcApi.put()` to sync stock to WooCommerce

While it ALSO updates BranchStock (which is correct), it should not be writing to legacy columns directly or syncing to WC. Should use `syncLegacyStockColumns()` instead of individual legacy writes, and remove WC sync.

### CRITICAL-4: `update-stock` route writes directly to legacy columns + WC

**File:** `app/api/products/update-stock/route.ts`

This route was not touched by the agent. It writes directly to `Product.stockQuantity` and syncs to WooCommerce. It does not update BranchStock at all. Any code calling this route bypasses BranchStock entirely.

---

## Minor Issues

### MINOR-1: `branchId` is optional in `CreatePurchaseOrderInput`

**File:** `lib/db/purchaseOrderService.ts` line ~20

`branchId?: string` — the spec says branchId should be required, not optional. Falls back to `'branch-main'` which masks bugs.

### MINOR-2: `getLowStockMaterials()` not redirected to BranchStock

**File:** `lib/db/materialService.ts` line ~253

Still queries `Material.stockQuantity` directly. Should redirect to `getLowStockItems(branchId)` from branchStockService.

### MINOR-3: `upsertMaterial()` does not create BranchStock entries

**File:** `lib/db/materialService.ts`

When a new material is created, no BranchStock entries are created for active branches.

### MINOR-4: `syncLegacyStockColumns()` not called after stock checks

**File:** `app/api/admin/stock-check/route.ts`

The spec says to call it "after stock checks." Currently only called after PO receiving.

### MINOR-5: No `app/admin/layout.tsx` — branch indicator not persistent

Branch selector only visible on dashboard page, not on orders/sales/materials pages.

---

## WC-vs-Local-DB Architecture Analysis

**Verdict: The agent implemented WC-based branch filtering, NOT local DB filtering.**

The agent's approach was:
1. Tag new WC orders with `_branch_id` meta_data (in `create-with-payment` route)
2. Fetch all orders from WC, then filter by meta_data in JavaScript

The spec required:
1. Store orders in local SQLite with `branchId` column
2. Query local DB with `WHERE branchId = ?`

This is the most significant architectural divergence. The order/sales/daily-stats/products-sold routes remain fully dependent on WooCommerce. This blocks the WC deprecation goal and makes branch filtering unreliable (legacy orders have no `_branch_id` tag, and the filtering falls back to including them).

The stock-related routes (materials, products, stock-check) correctly use local DB + BranchStock. The gap is specifically in the order/sales domain where no local Order table with branchId exists.

**Impact:** 5 out of 9 API routes are architecturally wrong. The frontend pages correctly use `branchFetch()` to send the header, but the backend routes ignore it for actual data filtering (they use WC meta_data filtering instead).
