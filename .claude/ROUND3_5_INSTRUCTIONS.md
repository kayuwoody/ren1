# Round 3.5 — Review Checklist & Known Issues

**Purpose:** This document is for the **new planning chat** to use when reviewing the code branch after commit `163933c` is applied. It tells the reviewer exactly what to check and what issues are already known so the review is efficient, not redundant.

**Code branch:** `claude/fork-multi-branch-kR5aM` (after user pushes `163933c` code to it)
**Spec:** `docs/MULTI_BRANCH_IMPLEMENTATION.md`
**Architecture rules:** See `.claude/session-state.md` § "Resolved Architectural Decisions"

---

## Context for the Reviewer

Commit `163933c` implemented all Round 3 fixes A-H in one pass. Fixes A-C have already been reviewed and passed (see `.claude/ROUND3_REVIEW_FINDINGS.md`). **Fixes D-H have NEVER been reviewed.** Your primary job is to review D-H, then also verify the known A-C issues. The output of this review becomes the **Round 4 instruction doc** for the code agent.

---

## PART 1: Review Fixes D-H (never reviewed)

### Fix D: `app/api/products/update-stock/route.ts`

**Spec requirement:** This route must:
1. Use `getBranchIdFromRequest(request)` to get branchId
2. Use `updateBranchStock(branchId, 'product', productId, newQuantity)` instead of `UPDATE Product SET stockQuantity`
3. Call `syncLegacyStockColumns()` after the update
4. Remove `wcApi.put()` WC sync call
5. Remove `wcApi` import if no longer used

**Check for:** Any remaining direct writes to `Product.stockQuantity`, any `wcApi` usage, missing branchId.

### Fix E: `lib/db/materialService.ts`

**Spec requirements:**
- **E1:** `updateMaterialStock()` should be DELETED (no callers remain after Fix C)
- **E2:** `getLowStockMaterials()` should query BranchStock, not `Material.stockQuantity`. Expected: redirect to `getLowStockItems(branchId, 'material')` from branchStockService. NOTE: the worktree review found `getLowStockItems()` only takes `branchId` with no `itemType` param — check if `163933c` fixed the signature or added a wrapper.
- **E3:** `upsertMaterial()` should create BranchStock entries for new materials via `initBranchStockForItem()`. NOTE: `initBranchStockForItem()` did not exist in the worktree — check if `163933c` added it to branchStockService.
- **E4 (additional):** `upsertMaterial()` UPDATE path should NOT write `stockQuantity` directly to the Material table.

### Fix F: `lib/db/productService.ts`

**Spec requirements:**
- **F1:** `upsertProduct()` should NOT write `stockQuantity` in INSERT or UPDATE SQL
- **F2:** `syncProductFromWooCommerce()` should NOT sync `stockQuantity` from WC (keep catalog fields: name, price, SKU, etc.)
- **F3:** New products created via upsert should get BranchStock entries (same pattern as E3)

### Fix G: `app/api/admin/stock-check/pdf/route.ts`

**Spec requirements:**
1. Accept `branchId` parameter (from request header or query param)
2. Look up branch via `getBranch(branchId)` from branchService
3. Include branch name and address in the PDF header
4. Read stock from BranchStock, not from `product.stockQuantity` / `material.stockQuantity` legacy columns

**Important:** The worktree review found this file reads from legacy columns (`product.stockQuantity`, `material.stockQuantity`). Check if `163933c` changed it to read from BranchStock.

### Fix H: Admin Layout Branch Indicator

**Spec requirements:**
1. `app/admin/layout.tsx` should exist
2. Should show a branch badge/indicator (read-only) with current branch name
3. Should use `useBranch()` from `context/branchContext.tsx`
4. Should wrap all admin pages (orders, sales, materials, POS, etc.)

**Check:** Does `app/admin/layout.tsx` exist? Does it render children? Does it show a branch indicator? Is `context/branchContext.tsx` imported correctly?

---

## PART 2: Verify Known A-C Issues

These were found in the A-C review. Check if `163933c` (which reimplemented everything from scratch) fixed them or if they persist.

### Fix A Known Issues

| # | Issue | Severity | What to check |
|---|-------|----------|---------------|
| A1 | `saveOrderLocally()` not wrapped in `db.transaction()` | Medium | Is order + items insertion atomic? |
| A2 | Uses `String(wooOrder.id)` instead of UUID for order ID | Low | Check if UUID is generated |
| A3 | `branchId` typed as optional in `LocalOrder` interface | Low | Check typing |
| A4 | `totalCost=0, totalProfit=0, overallMargin=0` never backfilled | Low | Acceptable if COGS computed at query time |
| A5 | No pagination in `getOrders()` | Low | Check if limit/offset supported |

### Fix B Known Issues

| # | Issue | Severity | What to check |
|---|-------|----------|---------------|
| B1 | COGS aggregation duplicated across routes B2, B3, B5 | Low | Each route independently calls `getOrderConsumptions()` — not a bug, just duplication |
| B2 | Response shape must match frontend expectations | Medium | Spot-check that route responses match what frontend pages expect |

### Fix C Known Issues

| # | Issue | Severity | What to check |
|---|-------|----------|---------------|
| C1 | POST handler update loop not in `db.transaction()` | Medium | Is the loop of `updateBranchStock()` calls wrapped? |

---

## PART 3: Cross-Cutting Checks

Run these across the entire codebase (not just the fix files):

### 3A: No remaining WC API calls in stock operations
```
grep -r "wcApi" app/api/admin/stock-check/ app/api/products/update-stock/
```
Expected: zero results.

### 3B: No direct legacy stock writes outside syncLegacyStockColumns
```
grep -rn "UPDATE.*Product.*SET.*stockQuantity" lib/db/ app/api/
grep -rn "UPDATE.*Material.*SET.*stockQuantity" lib/db/ app/api/
```
Expected: Only in `syncLegacyStockColumns()` inside `branchStockService.ts`.

### 3C: branchId present in all stock-modifying routes
Check that these routes all call `getBranchIdFromRequest()`:
- `app/api/admin/stock-check/route.ts` ✓ (confirmed in A-C review)
- `app/api/products/update-stock/route.ts` (check!)
- `app/api/orders/create-with-payment/route.ts` ✓ (confirmed)

### 3D: `syncLegacyStockColumns()` called after all batch stock operations
Should be called in:
- Stock check POST (after all updates)
- Update-stock route (after single update)
- PO receiving (already confirmed working)
- Inventory consumption (check if called after product sale)

### 3E: TypeScript build check
```
npm run build
```
Must pass with zero errors. If there are errors, catalog them for Round 4.

---

## PART 4: What NOT to Re-Review

These passed in earlier reviews and should not be touched:

| Component | Status | Round |
|-----------|--------|-------|
| `inventoryConsumptionService.ts` | PASS | Round 2 |
| `purchaseOrderService.ts` | PASS | Round 2 |
| All 5 frontend pages using `branchFetch()` | PASS | Round 2 |
| PO number branch prefix (`generatePONumber`) | PASS | Round 2 |
| `syncLegacyStockColumns()` | PASS | Round 2 |
| Timezone migration | PASS | Round 2 |
| `branchContext.tsx` | PASS | Round 3 (A-C review) |
| `create-with-payment` local order save | PASS | Round 3 (A-C review) |
| 5 admin reporting routes (orders, sales, daily, daily-stats, products-sold) | PASS | Round 3 (A-C review) |
| Stock-check route (GET + POST) | PASS | Round 3 (A-C review) |

---

## Output: What the Review Should Produce

After completing Parts 1-3, write a **Round 4 Instruction Doc** (`.claude/ROUND4_FIX_INSTRUCTIONS.md`) containing:

1. **For each fix D-H:** PASS, PARTIAL (list specific issues), or FAIL (list what's wrong)
2. **For each known A-C issue:** STILL PRESENT or FIXED
3. **For cross-cutting checks:** Results of 3A-3E
4. **Actionable fix list** for the code agent — only things that need changing, with exact file paths and what to do
5. **Build errors** if any, with fixes

The Round 4 doc should be self-contained — a code agent reading ONLY that doc should be able to complete all remaining work.
