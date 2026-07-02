# Round 6 — Review Findings

**Date:** 2026-06-16
**Scope:** Full re-audit of Fixes D-H from Round 3, plus COGS duplication, transaction wrappers, and WooCommerce remnants
**Branch:** `claude/review-session-state-vR06M`

---

## Summary

All critical fixes from Rounds 3-5 are confirmed implemented and working. WooCommerce is fully removed. BranchStock is the sole source of truth for stock. Transaction wrappers are in place. What remains is dead code cleanup and a COGS helper consolidation opportunity.

---

## Fix-by-Fix Status

### Fix D: update-stock route — ✅ FULLY FIXED

**File:** `app/api/products/update-stock/route.ts`

All five March 2026 violations resolved:
1. ~~`wcApi` import~~ → Removed. Imports from `branchStockService`, `branchHelper`, `stockMovementService`
2. ~~Direct `Product.stockQuantity` write~~ → Uses `updateBranchStock()` then `syncLegacyStockColumns()`
3. ~~`wcApi.put()` WC sync~~ → Removed entirely
4. ~~Missing `getBranchIdFromRequest`~~ → Present, extracts from `X-Branch-Id` header
5. ~~Missing `updateBranchStock`/`syncLegacyStockColumns`~~ → Both imported and used

No issues remain.

---

### Fix E: materialService — ✅ FULLY FIXED (minor dead code)

**File:** `lib/db/materialService.ts`

All four March 2026 issues resolved:
1. ~~`updateMaterialStock()` exists~~ → Deleted
2. ~~`getLowStockMaterials()` queries legacy columns~~ → Delegates to `getLowStockItems(branchId)`, filters by `itemType === 'material'`
3. ~~No BranchStock init for new materials~~ → `initBranchStockForItem('material', id)` called after INSERT
4. ~~UPDATE path writes `stockQuantity`~~ → Removed from SET clause with comment

**Residual cleanup (non-breaking):**
- Dead stock movement logging in UPDATE path (lines 82-93): compares `existing.stockQuantity` vs `material.stockQuantity` and logs a movement, but the UPDATE SQL no longer writes `stockQuantity` — so the log entry records a change that doesn't happen
- INSERT path still writes `material.stockQuantity` to the legacy `Material.stockQuantity` column (line 108), while `initBranchStockForItem` creates BranchStock entries at 0 — minor inconsistency for new materials with non-zero initial stock
- `Material` interface still declares `stockQuantity` (line 17) — vestigial

---

### Fix F: productService — ✅ MOSTLY FIXED (dead code)

**File:** `lib/db/productService.ts`

All three March 2026 issues resolved or neutralized:
1. ~~UPDATE writes `stockQuantity`~~ → Removed from SET clause with comment: "do NOT write stockQuantity (managed by BranchStock)"
2. ~~`syncProductFromWooCommerce()` reads WC stock~~ → Neutralized. Caller still computes a `stockQuantity` variable (line 215) and passes it (line 239), but `upsertProduct()` ignores it on both paths
3. ~~No BranchStock init for new products~~ → `initBranchStockForItem('product', id)` called after INSERT when `manageStock` is true

**Residual cleanup (non-breaking):**
- Dead `stockQuantity` variable and debug logging in `syncProductFromWooCommerce()` (lines 215-228) — computed and passed but never used
- INSERT path hardcodes `stockQuantity: 0` to legacy column — acceptable default but column is vestigial
- `Product` interface still declares `stockQuantity` — vestigial
- `comboPriceOverride` on interface (line 18) but not in any SQL — may be stale or handled elsewhere

---

### Fix G: Stock Check PDF — ✅ FULLY FIXED

**File:** `app/api/admin/stock-check/pdf/route.ts`

All three March 2026 issues resolved:
1. ~~No `branchId` parameter~~ → `getBranchIdFromRequest(req)` on line 36
2. ~~No branch name in PDF header~~ → Branch name (bold, centered) and address rendered in header
3. ~~Reads legacy `stockQuantity` columns~~ → Calls `getBranchStock(branchId, 'product'|'material', id)`

No issues remain.

---

### Fix H: Admin Layout Branch Indicator — ✅ FULLY FIXED

**File:** `app/admin/layout.tsx`

File now exists and renders:
- Blue dot + branch name (bold) + branch code in parentheses
- Styled as `bg-blue-50` bar with bottom border
- Uses `useBranch()` from branch context

No issues remain.

---

## WooCommerce Removal — ✅ COMPLETE

- `lib/wooClient.ts` has been **deleted**
- Zero functional imports of `wcApi` or `wooClient` anywhere in the codebase
- **One cosmetic remnant:** `lib/api/error-handler.ts` line 41 has a stale `wcApi.get('orders/123')` in a JSDoc `@example` comment — no runtime impact

---

## Transaction Wrappers — ✅ BOTH PRESENT

| Location | Status |
|----------|--------|
| `lib/db/orderService.ts` → `saveOrderLocally` (line 320) | ✅ Wrapped in `db.transaction()` |
| `app/api/admin/stock-check/route.ts` → POST handler (line 126) | ✅ Wrapped in `db.transaction()` |

---

## COGS Aggregation Duplication — ⚠️ MAINTAINABILITY CONCERN

4 files call `getOrderConsumptions()` from `inventoryConsumptionService.ts`:

| File | Route | Pattern |
|------|-------|---------|
| `app/api/admin/sales/route.ts` | `GET /api/admin/sales` | Per-order COGS sum → daily aggregation |
| `app/api/admin/sales/daily/route.ts` | `GET /api/admin/sales/daily` | Per-order + per-item COGS → detailed daily view |
| `app/api/admin/products-sold/route.ts` | `GET /api/admin/products-sold` | Per-order + per-item COGS → product stats + expanded combo COGS |
| `app/api/online-orders/[orderId]/route.ts` | `PATCH /api/online-orders/[orderId]` | Existence check only (guard against double-recording) |

The first three routes all duplicate the same pattern: fetch consumptions per order, sum `totalCost`, filter by `orderItemId` for item-level COGS, compute profit/margin. A centralized `getOrderWithCOGS(orderId)` or `computeOrderCOGS(orderId)` helper in `orderService.ts` could eliminate this repetition.

**Not a correctness issue.** All three produce correct results. This is a maintainability/DRY concern — any change to COGS aggregation logic would need to be replicated in 3 places.

---

## Cleanup Backlog

### Dead Code — ✅ DONE (Round 7, 2026-06-16)
1. **materialService**: ~~Stock movement logging in UPDATE path records a change that no longer happens~~ → Removed the phantom `logStockMovement` call (and the now-unused import). Replaced with an explanatory comment.
2. **productService**: ~~Dead `stockQuantity` variable + debug logging in `syncProductFromWooCommerce()`~~ → Removed the **entire** `syncProductFromWooCommerce()` function. It had zero callers (WooCommerce is gone). `getProductByWcId` is retained — still used widely for id lookups.
3. **error-handler.ts**: ~~Stale WC reference in JSDoc~~ → Replaced the `wcApi.get(...)` example with a local `getOrderWithItems(...)` example and dropped the "WooCommerce API error extraction" bullet.

### Vestigial Schema Fields — DECISION: KEEP
4. **`Material.stockQuantity`** on interface — **KEEP.** Still read as a fallback in several places (e.g. stock-check route `getBranchStock(...) || material.stockQuantity`, materials admin display) and kept in sync by `syncLegacyStockColumns()`. Removing it would break those reads.
5. **`Product.stockQuantity`** on interface — **KEEP.** Same fallback role.
6. **`Product.comboPriceOverride`** — **FALSE ALARM.** Not stale. It is written via the dedicated `PATCH /api/admin/products/[productId]/combo-price` route (`UPDATE Product SET comboPriceOverride = ?`) and read across combo pricing (`recursiveProductExpansion`, `bundleExpansionService`, `ProductSelectionModal`, `catalogSync`, recipe route). It is simply not written by `upsertProduct` — by design.

### INSERT Path Legacy Writes
7. **materialService INSERT** writes `material.stockQuantity` to the legacy column while `initBranchStockForItem` seeds BranchStock at 0 — **OPEN (minor bug).** A new material created with a non-zero initial stock will show that stock until the next `syncLegacyStockColumns()` overwrites the legacy column back to BranchStock's 0. The materials admin form does expose a stock input. Proper fix needs a branch decision (which branch receives the initial quantity), so deferred — recommend adding initial stock through the stock-check / purchase-order flow instead of the create form, or seeding BranchStock on create.
8. **productService INSERT** hardcodes `stockQuantity: 0` to legacy column — **NON-ISSUE.** Consistent with BranchStock also initialising at 0. No action.

### Consolidation Opportunity
9. **COGS aggregation** duplicated across 3 reporting routes (`sales`, `sales/daily`, `products-sold`) — **OPEN (optional refactor).** Could extract a `getOrderCOGS(orderId)` helper returning `{ total, byItemId }` into `orderService.ts`. Not breaking; deferred pending a decision to take on the refactor risk on the reporting routes.

---

## Architecture Health Summary

| Area | Status |
|------|--------|
| BranchStock as source of truth | ✅ Enforced |
| WooCommerce dependencies | ✅ Fully removed |
| Transaction safety | ✅ In place |
| Branch-aware stock operations | ✅ All routes use `getBranchIdFromRequest` |
| Legacy column writes (UPDATE paths) | ✅ Blocked — only `syncLegacyStockColumns()` writes them |
| Legacy column writes (INSERT paths) | ⚠️ Still write defaults — non-breaking but inconsistent |
| COGS aggregation | ⚠️ Duplicated across 3 routes — works but DRY violation |
| Dead code | ⚠️ Minor remnants — no runtime impact |

**Overall: The architecture is sound.** Core invariants are enforced. What remains is cleanup work that carries no risk of breaking functionality.
