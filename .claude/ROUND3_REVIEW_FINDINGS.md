# Round 3 Review Findings

**Reviewed:** Worktree at `.claude/worktrees/agent-af250b7d/` (branch `claude/fork-multi-branch-kR5aM`)
**Date:** 2026-03-10
**Scope:** Fixes A-C (completed by sub-agent), Fixes D-H (confirmed incomplete)

## Summary

Fixes A, B, and C are **implemented with no architectural violations**. All five admin reporting routes and the stock-check route have been correctly migrated from WooCommerce API calls to local SQLite queries. The `orderService.ts` was created and `create-with-payment` now saves orders locally. BranchStock is used as sole source of truth in the stock-check route.

**Fixes D, E, F, G, H are confirmed NOT implemented** in the worktree.

**No blockers found in Fixes A-C.** There are quality issues (no transactions, naming divergence from spec, optional branchId typing) but nothing that violates architectural rules.

---

## Fix A: PASS -- Local Order Storage

### A1: `lib/db/orderService.ts` -- Created

The service was created with a different API surface than spec prescribed, but is functionally equivalent:

| Spec Function | Actual Implementation | Notes |
|---|---|---|
| `createLocalOrder(input)` | `saveOrderLocally(wooOrder, branchId)` | Takes raw WC order object instead of typed input |
| `getLocalOrder(id)` | `getOrderWithItems(orderId)` | Equivalent |
| `listLocalOrders(branchId, opts)` | `getOrders(opts)` | No pagination (limit/offset) |
| `getSalesData(branchId, ...)` | Not a standalone function | Aggregation done in route handler |
| `getDailySales(branchId, ...)` | Not a standalone function | Aggregation done in route handler |
| `getDailyStats(branchId, date)` | `getDailyStats(branchId)` | No date param, always today |
| `getProductsSold(branchId, ...)` | Not a standalone function | Aggregation done in route handler |

**Issues (non-blocking):**
1. `saveOrderLocally()` uses `String(wooOrder.id)` as the order ID, not a UUID as spec requires. Works but diverges from intent.
2. `saveOrderLocally()` inserts `totalCost=0`, `totalProfit=0`, `overallMargin=0` and never backfills. COGS are computed at query time from `InventoryConsumption` records in route handlers.
3. `branchId` is typed as optional (`branchId?: string`) in `LocalOrder` interface. Should be required per architectural rules.
4. **No `db.transaction()` wrapper** around order + items insertion. Partial inserts possible on crash.
5. No pagination support in `getOrders()`.

### A2: `app/api/orders/create-with-payment/route.ts` -- Updated correctly

- Calls `saveOrderLocally(order, branchId)` after WC order creation (line 75).
- Non-fatal try/catch -- WC order succeeds even if local save fails. Correct per spec.
- `branchId` obtained from `getBranchIdFromRequest(req)`.
- WC order creation retained for payment processing as spec requires.

---

## Fix B: PASS -- Rewrite 5 Order/Sales Routes

All five routes fully rewritten. No WC API calls remain in any of them.

### B1: `app/api/admin/orders/route.ts` -- PASS
Uses `getOrders({ branchId, showAll })`. Returns flat array of orders. Clean.

### B2: `app/api/admin/sales/route.ts` -- PASS
Uses `getSaleOrders()`, computes revenue/COGS/margins inline using `getOrderConsumptions()`.
Response shape: `{ totalRevenue, totalOrders, averageOrderValue, totalDiscounts, totalCOGS, totalProfit, overallMargin, totalItemsSold, averageItemPrice, averageProfitPerItem, revenueByDay, topProducts, ordersByStatus }`.

### B3: `app/api/admin/sales/daily/route.ts` -- PASS
Uses `getDayOrders()`. Computes per-order COGS from consumption records. Handles bundle data parsing from `variations` JSON. Response: `{ date, summary, orders }`.

### B4: `app/api/admin/daily-stats/route.ts` -- PASS
Uses `getDailyStats(branchId)`. Returns `{ todayOrders, todayRevenue, itemsSold, pendingOrders }`. Graceful zero-fallback on error.

### B5: `app/api/admin/products-sold/route.ts` -- PASS
Uses `getSaleOrders()`. Computes per-product stats with COGS. Response: `{ summary, allProducts, highlights, dateRange }`.

**Cross-cutting observation:** COGS aggregation logic is duplicated across routes B2, B3, and B5 (each independently calls `getOrderConsumptions()` per order and computes margins). Spec intended this to live in `orderService.ts`. Not a correctness issue, but a maintainability concern.

---

## Fix C: PASS -- Stock Check Route

**File:** `app/api/admin/stock-check/route.ts`

### GET handler -- Correct
- Reads stock from `getBranchStock(branchId, ...)` for each product and material.
- Uses BranchStock as source of truth. No legacy column reads for stock values.

### POST handler -- Correct
- **Removed:** `updateMaterialStock()` call -- confirmed absent.
- **Removed:** Direct `UPDATE Product SET stockQuantity = ?` -- confirmed absent.
- **Removed:** `wcApi.put()` call -- confirmed absent. No `wcApi` import in file.
- Uses `updateBranchStock(branchId, ...)` for each item -- correct.
- Calls `syncLegacyStockColumns()` once after all updates -- correct per spec.
- Creates stock check log with `branchId`.

**Issue (non-blocking):** POST handler loop of `updateBranchStock()` calls is not wrapped in `db.transaction()`. Partial updates possible on crash.

---

## Fix D: NOT IMPLEMENTED -- Update-Stock Route

**File:** `app/api/products/update-stock/route.ts`

Confirmed **untouched**. The file still:
1. Imports `wcApi` from `@/lib/wooClient` (line 3)
2. Writes directly to `Product.stockQuantity` via `UPDATE Product SET stockQuantity = ?` (line 47)
3. Calls `wcApi.put()` to sync stock to WooCommerce (line 54)
4. Does NOT use `getBranchIdFromRequest`
5. Does NOT use `updateBranchStock` or `syncLegacyStockColumns`

**This is an active architectural violation** (direct legacy writes + WC sync).

---

## Fix E: NOT IMPLEMENTED -- materialService Cleanup

**File:** `lib/db/materialService.ts`

All three sub-fixes confirmed missing:

### E1: `updateMaterialStock()` still exists (line 239-248)
Still writes directly to `Material.stockQuantity`. The stock-check route (Fix C) no longer calls it, but it remains exported and callable.

### E2: `getLowStockMaterials()` still queries legacy columns (line 253-260)
Queries `WHERE stockQuantity <= lowStockThreshold` on the `Material` table directly. Not redirected to `branchStockService.getLowStockItems()`.

Note: `getLowStockItems()` in branchStockService has signature `getLowStockItems(branchId: string)` with no `itemType` parameter. The spec assumed `getLowStockItems(branchId, 'material')` which doesn't match. Would need either a branchStockService change or a filter wrapper.

### E3: `upsertMaterial()` does not create BranchStock for new materials
No `initBranchStockForItem` call. That function also does not exist in `branchStockService.ts`. Only `initBranchStockForNewBranch()` exists (creates stock entries for all items when a new *branch* is created).

Additionally: `upsertMaterial()` UPDATE path (line 52-73) still writes `stockQuantity` directly to the Material table, which can desynchronize from BranchStock.

---

## Fix F: NOT IMPLEMENTED -- productService Cleanup

**File:** `lib/db/productService.ts`

All three sub-fixes confirmed missing:

1. `upsertProduct()` still writes `stockQuantity` in both INSERT (line 125) and UPDATE (line 101, 109) SQL.
2. `syncProductFromWooCommerce()` still reads WC stock for new products (line 184: `wcProduct.stock_quantity ?? 0`) and writes it via `upsertProduct()`.
3. No BranchStock entry creation for new products.

---

## Fix G: NOT IMPLEMENTED -- Stock Check PDF

**File:** `app/api/admin/stock-check/pdf/route.ts`

Confirmed untouched:
1. No `branchId` parameter accepted (function signature is `GET()` with no request param, line 31).
2. No branch name/address in PDF header.
3. Reads stock from `product.stockQuantity` and `material.stockQuantity` (legacy columns, lines 49, 63) rather than BranchStock. Shows aggregate stock across all branches.

---

## Fix H: NOT IMPLEMENTED -- Admin Layout Branch Indicator

Confirmed: `app/admin/layout.tsx` does **not exist** in the worktree.

`context/branchContext.tsx` does exist and correctly provides `branchFetch` and `useBranch`. It is ready to be consumed by a future admin layout component.

---

## Additional Findings

1. **`inventoryConsumptionService.ts` is correct.** Uses `adjustBranchStock()` for both material and product stock deductions. Has `branchId` threaded through all functions. No legacy direct writes. No WC sync calls. Passes review.

2. **`branchContext.tsx` is correct.** Provides `BranchProvider` with `currentBranch`, `branches`, `setBranch`, `branchFetch` (injects `X-Branch-Id` header). Uses sessionStorage for persistence.

3. **`branchStockService.ts` has `syncLegacyStockColumns`.** Confirmed present (lines 113-126). Updates both `Material.stockQuantity` and `Product.stockQuantity` as aggregate SUMs from BranchStock. Correct implementation.

4. **No remaining callers of `updateMaterialStock` in routes.** The function exists in materialService.ts but grep confirms no route or service file imports or calls it. The stock-check route (its former caller) now uses `updateBranchStock`. Safe to delete in Fix E.

5. **Duplicate date-range logic.** `buildDateFilter()` in `orderService.ts` and the inline date computation in `products-sold/route.ts` (lines 161-192) duplicate timezone-aware date range logic.

---

## Remaining WooCommerce References

**In routes that were cleaned (Fixes A-C scope):**

| File | WC References | Status |
|------|--------------|--------|
| `app/api/admin/orders/route.ts` | None | CLEAN |
| `app/api/admin/sales/route.ts` | None | CLEAN |
| `app/api/admin/sales/daily/route.ts` | None | CLEAN |
| `app/api/admin/daily-stats/route.ts` | None | CLEAN |
| `app/api/admin/products-sold/route.ts` | None | CLEAN |
| `app/api/admin/stock-check/route.ts` | None | CLEAN |
| `app/api/orders/create-with-payment/route.ts` | `createWooOrder` | EXPECTED (kept for payment) |

**In routes that should have been cleaned but weren't (Fix D):**

| File | WC References | Status |
|------|--------------|--------|
| `app/api/products/update-stock/route.ts` | `wcApi` import + `wcApi.put()` | DIRTY -- Fix D not done |

---

## Blockers for Fixes A-C

**None.** The completed work has no architectural violations:
- BranchStock is sole source of truth in stock-check (Fix C)
- Local SQLite queries replace WC API calls in all 5 reporting routes (Fix B)
- branchId is threaded through from request headers in all routes
- `syncLegacyStockColumns()` called after batch stock updates
- No WC sync added to any stock operation

---

## Recommendations

**Priority (should do before merge):**
1. Wrap `saveOrderLocally()` in `db.transaction()` -- prevents partial order inserts.
2. Wrap stock-check POST update loop in `db.transaction()` -- prevents partial stock updates.
3. Complete Fix D next -- it is the only remaining architectural violation in stock routes.

**Nice-to-have:**
4. Move COGS aggregation logic from route handlers into `orderService.ts` functions to reduce duplication.
5. Use UUID for local order ID instead of stringified WC ID.
6. Make `branchId` non-optional in `LocalOrder` interface.
7. Complete Fixes E and F (service cleanup) to remove legacy `updateMaterialStock()` and stop `upsertProduct()` from writing `stockQuantity`.
8. Complete Fixes G and H (UI improvements) for branch info in PDF and admin header indicator.
