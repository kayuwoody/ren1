# Round 3 Review Findings

## Summary

**Overall: PARTIAL PASS** -- 14 issues found (3 blockers, 5 medium, 6 low).

**Critical meta-issue:** Commit `c726392` ("Revert code changes: this branch is planning-only") reverted ALL Round 3 implementation from commit `163933c`. The code no longer exists in the working tree. This review was performed against the implementation at commit `163933c`.

All 8 fixes (A-H) were implemented. Fixes C, D, G, and H are clean passes. Fixes A, B, E, and F have issues ranging from low to blocker severity.

---

## Fix A: PARTIAL — Local Order Storage

### A1: orderService.ts — Created

**Issues:**

1. **[BLOCKER] No transaction wrapping.** `saveOrderLocally()` inserts an Order row and then loops to insert OrderItem rows without wrapping in `db.transaction()`. If the process crashes mid-loop, the Order row exists with partial or missing items. The spec explicitly requires: "Wrap multi-step stock ops in `db.transaction()`."

2. **[LOW] Function names differ from spec.** Spec says `createLocalOrder()`, `getLocalOrder()`, `listLocalOrders()`, `getSalesData()`, `getDailySales()`, `getProductsSold()`. Implementation uses `saveOrderLocally()`, `getOrderWithItems()`, `getOrders()`, `getSaleOrders()`, `getDayOrders()`. Functionally equivalent but deviates from spec API. Not a blocker since the routes use the right functions.

3. **[LOW] branchId is optional in LocalOrder type.** `branchId?: string` (line 30) -- per architecture, branchId should be required in data types. The `getOrders()` function also treats `branchId` as optional (line 133). This is acceptable at the service layer if the API layer always provides it, but weakens type safety.

4. **[LOW] Order ID uses WC ID as string.** `const orderId = String(wooOrder.id)` (line 324) -- spec says "Generate a UUID for the local order `id`". Using the WC ID as the local ID means it's not a UUID and could collide with locally-generated UUIDs if local-only orders are ever added.

5. **[LOW] `saveOrderLocally` sets `totalCost`, `totalProfit`, `overallMargin` to 0.** These values are never backfilled after inventory consumption runs. Orders will always show 0 COGS in the orders table, making the sales reports dependent on computing COGS at query time from order items.

### A2: create-with-payment/route.ts — Updated

**Correct.** Calls `saveOrderLocally(order, branchId)` after WC order creation. Wrapped in try/catch so local failure doesn't block the order. `getBranchIdFromRequest` correctly falls back to default branch.

---

## Fix B: PARTIAL — Rewrite 5 Order/Sales Routes

### B1: admin/orders/route.ts — PASS
WC calls removed. Uses `getOrders({ branchId })` from orderService. Clean implementation.

### B2: admin/sales/route.ts — PASS
WC calls removed. Uses `getSaleOrders()` and computes aggregates in-route. Response shape looks correct (totalRevenue, totalOrders, averageOrderValue, revenueByDay, topProducts, ordersByStatus).

### B3: admin/sales/daily/route.ts — PASS
WC calls removed. Uses `getDayOrders()`. Response shape includes date, summary, and detailed orders with per-item breakdown including bundle support.

### B4: admin/daily-stats/route.ts — PASS
WC calls removed. Uses `getDailyStats(branchId)`. Returns `{ todayOrders, todayRevenue, itemsSold, pendingOrders }`.

### B5: admin/products-sold/route.ts — PASS
WC calls removed. Uses `getSaleOrders()` and computes product-level stats. Response includes summary, allProducts, highlights (topSelling, highestRevenue, etc.), dateRange.

**One concern across all B routes:** The `dateRange` in products-sold (line 131-132) hardcodes `start` and `end` to `new Date().toISOString()` instead of the actual date range used in the query. This means the frontend will display incorrect date range info.

---

## Fix C: PASS — Stock Check Route

**POST handler is correct:**
- No `updateMaterialStock()` call
- No raw `UPDATE Product SET stockQuantity` SQL
- No `wcApi` import or calls
- Uses `updateBranchStock(branchId, ...)` for each item
- Calls `syncLegacyStockColumns()` once at the end
- All imports are clean

**GET handler concern (not in scope but notable):** The GET handler still reads from legacy `product.stockQuantity` and `material.stockQuantity` columns. Since `syncLegacyStockColumns()` is called after POST, this should be consistent -- but it shows aggregate stock across all branches, not branch-specific stock. For a single-branch deployment this is fine, but multi-branch stock checks will show combined stock.

---

## Fix D: PASS — Update-Stock Route

All requirements met:
- Imports `getBranchIdFromRequest` and `updateBranchStock`
- Gets `branchId` from request
- Uses `updateBranchStock(branchId, 'product', productId, stockQuantity)` instead of legacy UPDATE
- Calls `syncLegacyStockColumns()` after update
- No `wcApi` import or calls
- Clean implementation

---

## Fix E: PARTIAL — materialService.ts Cleanup

### E1: Remove `updateMaterialStock()` — PASS
Function is deleted. No remaining callers in code files (only in documentation files).

### E2: Redirect `getLowStockMaterials()` — **[MEDIUM] INCORRECT**
The spec says:
```typescript
export function getLowStockMaterials(branchId: string) {
  return getLowStockItems(branchId, 'material');
}
```

The implementation calls `getLowStockItems(branchId)` without the `'material'` type filter. Furthermore, `getLowStockItems()` in `branchStockService.ts` does not accept an `itemType` parameter at all -- its signature is `getLowStockItems(branchId: string)`. This means `getLowStockMaterials()` returns ALL low stock items (both materials AND products), which is semantically wrong for a function named "getLowStock**Materials**".

The fix requires either:
(a) Adding an optional `itemType` parameter to `getLowStockItems()`, or
(b) Filtering the results in `getLowStockMaterials()`.

Currently no callers of `getLowStockMaterials` exist in the app routes, so this is medium severity.

### E3: Init BranchStock for New Materials — PASS
`upsertMaterial()` calls `initBranchStockForItem('material', id)` when inserting a new material (line 106). Correct.

### Additional note on E:
`upsertMaterial()` UPDATE path still writes `stockQuantity` directly to the Material table (line 56). The spec for Fix E does not explicitly require removing this, so it's not a violation, but it contradicts the BranchStock-as-sole-source-of-truth architecture. When a material is updated via the admin UI, whatever `stockQuantity` value the caller passes overwrites the legacy column directly, potentially desynchronizing it from BranchStock.

---

## Fix F: PASS — productService.ts

### F1: Stop writing stockQuantity in upsertProduct() — PASS
The UPDATE path (line 94-116) does NOT include `stockQuantity` in the SET clause. Comment confirms: "do NOT write stockQuantity (managed by BranchStock)".

The INSERT path (line 118-146) hardcodes `stockQuantity` to `0`, which is correct for a new product.

### F2: Stop syncing stock from WC in syncProductFromWooCommerce() — PASS
Line 186: `const stockQuantity = existing?.stockQuantity ?? 0` preserves the local value instead of using WC's stock. The variable is then passed to `upsertProduct()` but since the UPDATE path doesn't write stockQuantity, this is effectively a no-op for existing products.

**[LOW] Misleading comment on line 201:** `stockQuantity, // Use WooCommerce stock as source of truth` -- this comment directly contradicts the architecture. The code is correct (preserves local value), but the comment is wrong and could confuse future maintainers.

### F3: Init BranchStock for new products — PASS
Line 142-145: `initBranchStockForItem('product', id)` called when `!existing && product.manageStock`.

---

## Fix G: PASS — Stock Check PDF Branch Info

All requirements met:
- Accepts `branchId` from request header via `getBranchIdFromRequest(req)` (line 122)
- Looks up branch via `getBranch(branchId)` (line 123)
- Includes branch name (bold, centered, blue) in PDF header (lines 125-133)
- Includes branch address if available (lines 136-147)
- Follows same PDF generation patterns as the rest of the file

---

## Fix H: PASS — Branch Indicator in Admin Header

### admin/layout.tsx — Created correctly
- Uses `useBranch()` from `branchContext.tsx`
- Shows branch name and code as a read-only indicator bar
- Not a selector (matches spec requirement)
- Blue-themed badge with colored dot

### branchContext.tsx — Created correctly
- Provides `BranchProvider` with `currentBranch`, `branches`, `setBranch`, `branchFetch`
- `branchFetch` injects `X-Branch-Id` header automatically
- Uses sessionStorage for persistence
- Fetches branches from `/api/admin/branches`

### app/layout.tsx — Wrapped correctly
- `BranchProvider` wraps the entire app (line 15-20)
- Placed outside `CartProvider` which is correct

### api/admin/branches/route.ts — Created correctly
- Simple GET endpoint returning `getActiveBranches()`

---

## Additional Findings

### 1. [BLOCKER] Implementation is reverted
Commit `c726392` ("Revert code changes: this branch is planning-only") reverted ALL code changes from `163933c`. The current HEAD has none of the Round 3 implementation. The implementation needs to be re-applied (cherry-pick `163933c` or revert the revert).

### 2. [MEDIUM] No transaction wrapping in saveOrderLocally
As noted in Fix A, the order + order items insert is not atomic. This violates the architectural rule: "Wrap multi-step stock ops in `db.transaction()`."

### 3. [MEDIUM] Stock Check GET reads legacy columns, not BranchStock
The GET handler for `/api/admin/stock-check` shows aggregate stock from legacy columns rather than branch-specific stock from BranchStock. In a multi-branch deployment, users would see combined stock instead of their branch's stock.

### 4. [MEDIUM] Products-sold dateRange hardcoded
`app/api/admin/products-sold/route.ts` line 131-132 sets dateRange start and end to `new Date().toISOString()` instead of the actual query date range.

### 5. [MEDIUM] inventoryConsumptionService has no transaction wrapping
`recordProductSale()` inserts multiple InventoryConsumption rows and adjusts BranchStock for multiple materials in a loop without wrapping in a transaction. If the process fails mid-way, partial consumption records will exist.

---

## Remaining WooCommerce References

### In scope (stock/order routes) -- CLEAN
No `wcApi` or `fetchAllWooPages` references remain in:
- `app/api/admin/orders/route.ts`
- `app/api/admin/sales/route.ts`
- `app/api/admin/sales/daily/route.ts`
- `app/api/admin/daily-stats/route.ts`
- `app/api/admin/products-sold/route.ts`
- `app/api/admin/stock-check/route.ts`
- `app/api/products/update-stock/route.ts`

### Out of scope (not addressed in Round 3, acceptable)
- `app/api/admin/products/costs/route.ts` -- uses `fetchAllWooPages` for product catalog sync
- `app/api/admin/customers/route.ts` -- uses `fetchAllWooPages` for customer data
- `app/api/products/route.ts` -- uses `wcApi` for product sync
- `app/api/orders/route.ts` -- uses `wcApi` for order management
- `app/api/orders/create-with-payment/route.ts` -- still creates WC orders (intentionally kept per spec)

---

## Blockers

1. **Implementation is reverted.** Commit `c726392` undid all Round 3 changes. Must re-apply (revert the revert or cherry-pick `163933c`).

2. **`saveOrderLocally()` lacks transaction wrapping.** Order + OrderItem inserts must be atomic. Wrap in `db.transaction()`.

3. **`getLowStockMaterials()` returns products too.** The `getLowStockItems()` function needs an `itemType` filter parameter, or `getLowStockMaterials` needs to filter results. Currently returns semantically incorrect data.

---

## Recommendations

1. **Add `itemType` filter to `getLowStockItems()`.** Make the second parameter optional so it can filter by `'material'` or `'product'` when needed.

2. **Fix misleading comment in `syncProductFromWooCommerce()`.** Line 201 says "Use WooCommerce stock as source of truth" but the code correctly preserves local stock. Change to "Preserve existing local stock value".

3. **Make stock-check GET branch-aware.** Read from BranchStock instead of legacy columns so each branch sees its own stock levels.

4. **Fix products-sold dateRange.** Pass the actual computed startDate/endDate to the response instead of `new Date().toISOString()`.

5. **Use UUID for local order ID.** Instead of `String(wooOrder.id)`, use `uuidv4()` and store WC ID in the `wcId` column per the spec.

6. **Wrap `recordProductSale()` in a transaction.** Multiple inserts + stock adjustments should be atomic.

7. **Stop writing `stockQuantity` in `upsertMaterial()` UPDATE path.** The material UPDATE still directly sets `Material.stockQuantity`, which can desynchronize from BranchStock. Consider removing it from the UPDATE SQL and relying on `syncLegacyStockColumns()` instead.

8. **Back-fill order COGS.** After `recordProductSale()` computes consumption, update the Order row's `totalCost`, `totalProfit`, `overallMargin` so that order-level reports don't need to re-aggregate from consumption records.
