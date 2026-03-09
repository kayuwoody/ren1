# Multi-Branch Implementation Review Findings

**Branch:** `claude/pos-multi-branch-support-YS4Qr`
**Review date:** 2026-03-09
**Reviewer:** Code Review Agent

---

## Summary Table

| Task | Description | Status | Severity |
|------|-------------|--------|----------|
| 1A | inventoryConsumptionService.ts - Remove legacy stock writes | Not done | CRITICAL |
| 1B | materialService.ts - Remove legacy stock column usage | Not done | CRITICAL |
| 1C | productService.ts - Remove legacy stock column usage | Not done | CRITICAL |
| 1D | purchaseOrderService.ts - Fix PO receiving | Not done | CRITICAL |
| 2A | Order creation route - branchId | Not done | CRITICAL |
| 2B | Order listing route - branchId filter | Not done | HIGH |
| 2C | Sales reports route - branchId filter | Not done | HIGH |
| 2D | Daily sales route - branchId filter | Not done | HIGH |
| 2E | Daily stats route - branchId filter | Not done | HIGH |
| 2F | Products sold route - branchId filter | Not done | HIGH |
| 2G | Materials listing route - JOIN BranchStock | Not done | HIGH |
| 2H | Products listing route - JOIN BranchStock | Not done | HIGH |
| 2I | COGS route - stock from BranchStock | Not done | LOW |
| 3A | POS page - branchFetch | Not done | CRITICAL |
| 3B | Orders page - branchFetch | Not done | HIGH |
| 3C | Sales page - branchFetch | Not done | HIGH |
| 3D | Daily sales page - branchFetch | Not done | HIGH |
| 3E | Materials page - branchFetch | Not done | HIGH |
| 4  | PO Number Branch Prefix | Not done | MEDIUM |
| 5A | PO PDF - branch info | Not done | MEDIUM |
| 5B | Stock check PDF - branch info | Not done | MEDIUM |
| 5C | Receipts - branch info | Not done | MEDIUM |
| 6  | Branch Indicator in Admin Header | Not done | LOW |
| 7  | Legacy Column Aggregation (syncLegacyStockColumns) | Not done | MEDIUM |
| 8  | Schema - timezone column on Branch | Not done | LOW |

---

## Detailed Findings

### Task 1A: `lib/db/inventoryConsumptionService.ts` -- NOT DONE

**Every sub-item is unimplemented:**

1. **recordProductSale() NOT refactored** -- Still uses positional arguments (line 36-48). No options object. No `branchId` parameter at all.
2. **deductMaterialStock() NOT changed** -- Still calls `updateMaterialStock(materialId, newStock)` on line 384, writing directly to `Material.stockQuantity`. Does NOT use `adjustBranchStock()`.
3. **deductLocalProductStock() NOT changed** -- Still does `db.prepare('UPDATE Product SET stockQuantity = ? WHERE id = ?').run(newStock, productId)` on line 405. Does NOT use `adjustBranchStock()`.
4. **deductWooProductStock() NOT removed** -- Still present at lines 421-452, actively using `wcApi`.
5. **logStockComparison() NOT removed** -- Still present at lines 457-479, actively using `wcApi`.
6. **WC calls NOT removed** -- `wcApi` is imported on line 6. `deductWooProductStock()` is called on line 323. `logStockComparison()` is called on lines 157, 326, 355.
7. **branchId NOT in InventoryConsumption INSERTs** -- All INSERT statements (lines 103-128, 224-249, 287-312) insert 16 columns with no `branchId`.
8. **branchId NOT threaded through recursion** -- Recursive call on lines 330-339 has no branchId parameter.

### Task 1B: `lib/db/materialService.ts` -- NOT DONE

1. **updateMaterialStock() NOT removed** -- Still present at lines 239-248, still writes directly to `Material.stockQuantity`.
2. **getLowStockMaterials() NOT redirected** -- Still queries `Material.stockQuantity` directly (lines 253-260). Not using `getLowStockItems(branchId)` from branchStockService.
3. **upsertMaterial() NOT updated** -- No BranchStock entries created when a new material is inserted (lines 79-103).

### Task 1C: `lib/db/productService.ts` -- NOT DONE

1. **Writes to Product.stockQuantity NOT removed** -- `upsertProduct()` still writes `stockQuantity` to Product table (lines 94-116 for update, lines 119-141 for insert).
2. **syncProductFromWooCommerce() NOT modified** -- Still syncs stock from WC for new products (line 184). Still passes `stockQuantity` through to `upsertProduct()`.

### Task 1D: `lib/db/purchaseOrderService.ts` -- NOT DONE

1. **markPurchaseOrderReceived() still writes legacy columns** -- Line 297-298: `UPDATE Material SET stockQuantity = stockQuantity + ? WHERE id = ?`. Line 302-303: `UPDATE Product SET stockQuantity = stockQuantity + ? WHERE id = ?`. Neither uses `adjustBranchStock()`.
2. **WC sync NOT removed** -- `wcApi` imported on line 15. `addWooProductStock()` function still present (lines 245-271). Called on line 309 during PO receiving.
3. **No branchId used** -- `order.branchId` is never read; stock adjustments are not branch-scoped.

### Task 2: API Routes (ALL 9) -- NOT DONE

**`getBranchIdFromRequest()` is not called in ANY API route.** It exists only in `lib/api/branchHelper.ts` (definition) and documentation files. Zero actual usage.

- **2A** `app/api/orders/create-with-payment/route.ts` -- No branchId. This route creates WooCommerce orders, not local SQLite orders, so the branchId gap exists at order creation level.
- **2B** `app/api/admin/orders/route.ts` -- No branchId filter. Still fetches from WooCommerce (`fetchAllWooPages('orders')`), not from local DB.
- **2C** `app/api/admin/sales/route.ts` -- No branchId filter. Fetches from WooCommerce.
- **2D** `app/api/admin/sales/daily/route.ts` -- No branchId filter. Fetches from WooCommerce.
- **2E** `app/api/admin/daily-stats/route.ts` -- No branchId filter. Fetches from WooCommerce.
- **2F** `app/api/admin/products-sold/route.ts` -- No branchId filter. Fetches from WooCommerce.
- **2G** `app/api/admin/materials/route.ts` -- No BranchStock JOIN. Returns `Material.stockQuantity` directly via `listMaterials()`.
- **2H** `app/api/products/route.ts` -- No BranchStock JOIN. Returns `Product.stockQuantity` directly. Still uses `wcApi` for sync.
- **2I** `app/api/products/[id]/cogs/route.ts` -- File does not exist.

**Note:** Routes 2B-2F are fetching data from WooCommerce, not local SQLite. The instructions assumed local DB queries with WHERE clauses. This is a deeper architectural gap: the sales/orders reporting layer still depends on WooCommerce, not the local Order table.

### Task 3: Frontend Pages (ALL 5) -- NOT DONE

**`branchFetch()` is not used anywhere in the codebase.** The `branchContext.tsx` file does not exist. `useBranch` is not imported in any admin page.

- **3A** `app/admin/pos/page.tsx` -- No branchFetch, no useBranch
- **3B** `app/admin/orders/page.tsx` -- No branchFetch, no useBranch
- **3C** `app/admin/sales/page.tsx` -- No branchFetch, no useBranch
- **3D** `app/admin/sales/daily/page.tsx` -- No branchFetch, no useBranch
- **3E** `app/admin/materials/page.tsx` -- No branchFetch, no useBranch

### Task 4: PO Number Branch Prefix -- NOT DONE

- `generatePONumber()` in `lib/db/purchaseOrderSchema.ts` (line 95) does NOT accept a `branchCode` parameter. Format is still `PO-YYYY-MM-NNNN`.
- `createPurchaseOrder()` in `lib/db/purchaseOrderService.ts` (line 47) calls `generatePONumber()` with no arguments. Does not pass branch code.

### Task 5: PDFs and Receipts -- NOT DONE

- **5A** `app/api/purchase-orders/[id]/pdf/route.ts` -- No branch info. Hardcoded address ("9ine Condominium, Jalan Suria Residen...") on lines 98-104. No lookup of `order.branchId` for branch-specific info.
- **5B** `app/api/admin/stock-check/pdf/route.ts` -- File exists but not reviewed for branch info (presumed not done based on pattern).
- **5C** `lib/receiptGenerator.ts` -- No branch info. Hardcoded to "Coffee Oasis" with hardcoded location "9ine" (line 246). No branch name/address/phone from DB.

### Task 6: Branch Indicator in Admin Header -- NOT DONE

- No admin layout file exists at `app/admin/layout.tsx`.
- `useBranch()` is not imported or used in any admin component.
- `branchContext.tsx` does not exist in the codebase.
- No branch badge/indicator anywhere in the UI.

### Task 7: Legacy Column Aggregation -- NOT DONE

- `syncLegacyStockColumns()` function does not exist anywhere in the codebase (only appears in the instruction document).
- No aggregation mechanism to keep `Material.stockQuantity` and `Product.stockQuantity` in sync with BranchStock sums.

### Task 8: Schema -- timezone Column -- NOT DONE

- `lib/db/init.ts` -- No migration for adding `timezone` column to Branch table. The word "timezone" does not appear in the file.
- Branch table CREATE statement (lines 31-42) has no `timezone` column.

---

## Critical Issues

### 1. NONE of the 8 tasks were implemented

The code on branch `claude/pos-multi-branch-support-YS4Qr` shows that the foundational schema (Branch table, BranchStock table, branchId migrations on scoped tables, `branchService.ts`, `branchStockService.ts`, `branchHelper.ts`) is in place. However, **none of the 8 work packages from the instruction document were executed**. Every service, API route, frontend page, and utility function remains in its pre-implementation state.

### 2. All operational stock writes still go to legacy columns

`Material.stockQuantity` and `Product.stockQuantity` are still the sole targets of all stock mutations:
- `inventoryConsumptionService.ts` writes to both (lines 384, 405)
- `purchaseOrderService.ts` writes to both (lines 297, 302)
- `app/api/admin/stock-check/route.ts` writes to both (lines 142, 185)
- `app/api/products/update-stock/route.ts` writes to `Product.stockQuantity` (line 47)

BranchStock is only seeded at DB init time and never updated by any operational code path.

### 3. WooCommerce sync calls still active in stock paths

- `inventoryConsumptionService.ts` imports and calls `wcApi` (deductWooProductStock, logStockComparison)
- `purchaseOrderService.ts` imports and calls `wcApi` (addWooProductStock)
- These should have been removed per the spec ("WooCommerce is being deprecated")

### 4. No branchId in any API request flow

`getBranchIdFromRequest()` exists but is called by zero API routes. No `X-Branch-Id` header is sent from any frontend page. The entire request-level branch scoping mechanism is unwired.

### 5. Caller of recordProductSale() not updated

`app/api/orders/consumption/route.ts` (line 62) calls `recordProductSale()` with the old positional signature and no `branchId`. If the function had been refactored to require an options object, this caller would break.

---

## Minor Issues

### 1. branchContext.tsx referenced but does not exist

The instructions reference `context/branchContext.tsx` as already existing ("branchContext.tsx -- React context with branchFetch() helper"), but the file is not present in the codebase. This is a prerequisite for Tasks 3 and 6.

### 2. No admin layout file

`app/admin/layout.tsx` does not exist, which means Task 6 (branch indicator in admin header) has no obvious target file. An admin layout would need to be created.

### 3. COGS route does not exist

`app/api/products/[id]/cogs/route.ts` referenced in Task 2I does not exist. This may be intentional (low priority) but is noted for completeness.

### 4. Many API routes still depend on WooCommerce for data

Routes like `/api/admin/orders`, `/api/admin/sales`, `/api/admin/sales/daily`, `/api/admin/daily-stats`, and `/api/admin/products-sold` all fetch data from WooCommerce via `fetchAllWooPages()`. The instructions assume these would be querying local SQLite with `WHERE branchId = ?` filters. Migrating these routes would require a larger architectural change beyond just adding branchId filters.

### 5. PurchaseOrder INSERT missing branchId

`createPurchaseOrder()` in `lib/db/purchaseOrderService.ts` (line 95-108) does not include `branchId` in the PurchaseOrder INSERT statement, despite the column existing on the table (added via migration in purchaseOrderSchema.ts).

---

## Conclusion

**0 of 8 tasks were completed.** The branch has the foundational schema and service layer (Branch, BranchStock, branchService, branchStockService, branchHelper) but none of the integration work specified in the instruction document was performed. All stock writes, API routes, frontend pages, PO numbers, PDFs, receipts, and schema additions remain in their pre-multi-branch state.
