# Multi-Branch Implementation — Agent Instructions

**Purpose:** Step-by-step work packages for code agents to complete the multi-branch support implementation. Each task is self-contained with clear inputs, outputs, and constraints.

**Branch:** `claude/pos-multi-branch-support-YS4Qr`

**Reference docs:**
- Spec: `docs/MULTI_BRANCH_IMPLEMENTATION.md`
- Architecture: `.claude/ARCHITECTURE_ROADMAP.md`
- Critical functions: `.claude/CRITICAL_FUNCTIONS.md`
- Session state: `.claude/session-state.md`

---

## Current State

Schema and foundational services are already implemented on our branch:
- Branch table, BranchStock table, branchId migrations on all 7 scoped tables
- `branchService.ts`, `branchStockService.ts`, `branchHelper.ts` — all working
- `branchContext.tsx` — React context with `branchFetch()` helper
- Several API routes and pages already updated (stock-check, purchase-orders, receipts, branch CRUD)

What remains: the gaps identified in the fork review (see `docs/MULTI_BRANCH_IMPLEMENTATION.md` § "Code Review Findings").

---

## Architectural Decisions (locked — do not deviate)

1. **BranchStock is the sole source of truth for stock quantities.** Stop all writes to `Material.stockQuantity` and `Product.stockQuantity`. Legacy columns become computed aggregates updated on read or periodically.
2. **WooCommerce is being deprecated.** Remove WC sync calls from stock operations. Don't add new WC integration.
3. **PO numbers are globally unique and branch-prefixed.** Format: `{BRANCH_CODE}-PO-YYYY-MM-NNNN` (e.g., `MAIN-PO-2026-03-0001`).
4. **Timezone:** UTC+8 hardcoded. Add `timezone TEXT` column to Branch table schema for future use, but do not wire it up.
5. **Suppliers are global.** No changes to supplier scoping.
6. **Cart isolation is NOT in scope.** Each local POS server serves one branch. No cart-per-branch logic needed in this phase.
7. **Products, recipes, and materials remain global** (shared catalog across all branches).

---

## Task 1: Eliminate Legacy Stock Writes (Critical — do first)

**Goal:** Make BranchStock the sole source of truth. Remove all direct writes to `Material.stockQuantity` and `Product.stockQuantity` during operations. Remove WooCommerce stock sync calls.

### 1A: `inventoryConsumptionService.ts` — Remove legacy stock writes

**File:** `lib/db/inventoryConsumptionService.ts`

Changes:
1. Add `branchId: string` as a required parameter to `recordProductSale()` (not optional — all callers must provide it).
   - Current signature has positional args. Refactor to use an options object:
     ```typescript
     interface RecordProductSaleOptions {
       orderId: string;
       wcProductId: string | number;
       productName: string;
       quantitySold: number;
       orderItemId?: string;
       bundleSelection?: { selectedMandatory: Record<string, string>; selectedOptional: string[] };
       branchId: string;
     }
     export async function recordProductSale(options: RecordProductSaleOptions): Promise<InventoryConsumption[]>
     ```
   - Internal recursion still uses depth/parentChain, but those are internal — not part of the public options.

2. Replace `deductMaterialStock()` (lines 365-385):
   - Currently calls `updateMaterialStock(materialId, newStock)` which writes to `Material.stockQuantity`
   - Change to call `adjustBranchStock(branchId, 'material', materialId, -quantity)` from `branchStockService.ts`
   - Remove the `updateMaterialStock` call entirely

3. Replace `deductLocalProductStock()` (lines 392-415):
   - Currently does `db.prepare('UPDATE Product SET stockQuantity = ? WHERE id = ?').run(newStock, productId)`
   - Change to call `adjustBranchStock(branchId, 'product', productId, -quantity)` from `branchStockService.ts`
   - Remove the raw SQL UPDATE

4. Remove `deductWooProductStock()` entirely (lines 421-452) — WC is being deprecated
5. Remove `logStockComparison()` entirely (lines 457-479) — WC comparison no longer relevant
6. Remove all `await` calls to the removed WC functions throughout `recordProductSale()`
7. Add `branchId` to all `InventoryConsumption` INSERT statements (the column already exists on the table)
8. The `branchId` must be threaded through the recursive calls — pass it in the internal recursion, not just at the top level

**Callers to update:** After changing the signature, find and update all callers:
- `app/api/orders/consumption/route.ts` — must pass branchId from `getBranchIdFromRequest()`

**Tests:** After changes, verify the app builds (`npm run build`). Run the POS flow manually if possible.

### 1B: `materialService.ts` — Remove legacy stock column usage

**File:** `lib/db/materialService.ts`

Changes:
1. `updateMaterialStock()` (line 239-248): This function directly updates `Material.stockQuantity`. It is called from `deductMaterialStock()` in inventoryConsumptionService (which we're fixing in 1A) and from PO receiving.
   - **Option A (preferred):** Remove this function entirely. All stock writes should go through `branchStockService.adjustBranchStock()` or `branchStockService.updateBranchStock()`. Find all callers and redirect them.
   - **Option B:** Repurpose it to update BranchStock instead, but this creates a confusing abstraction layer.
   - Go with Option A.

2. `getLowStockMaterials()` (line 253-260): Currently queries `Material.stockQuantity`. This needs to be replaced with a branch-aware query. Since low stock is branch-specific, callers must provide a `branchId`. Redirect to `getLowStockItems(branchId)` from `branchStockService.ts` (already exists and works).

3. `upsertMaterial()` (line 38-106): Currently writes `stockQuantity` into the Material table. For new materials, we need to ALSO create a BranchStock entry for the current branch. But `upsertMaterial` doesn't know about branches. Options:
   - Leave Material.stockQuantity writes in upsertMaterial for now (it's catalog data, not operational stock)
   - After upsertMaterial creates a new material, the calling code should call `initBranchStockForNewBranch` or manually create BranchStock entries
   - **Decision:** Keep the Material.stockQuantity column as the "initial stock on hand when material was created" (catalog metadata). Operational stock tracking is BranchStock only. When a new material is created, also insert a BranchStock row for each active branch (stock = 0 except the branch doing the creation).

### 1C: `productService.ts` — Remove legacy stock column usage

**File:** `lib/db/productService.ts`

Changes:
1. Find all places that write to `Product.stockQuantity` and redirect to BranchStock:
   - `syncProductFromWC()` — currently writes WC stock to Product.stockQuantity. Since WC is being deprecated, this function's stock sync behavior should be removed. Keep the product catalog sync (name, price, SKU) but stop syncing stockQuantity from WC.
   - Any raw `UPDATE Product SET stockQuantity = ?` — redirect to BranchStock

2. For reads: anywhere that reads `Product.stockQuantity` for display purposes should instead query BranchStock for the current branch. This affects:
   - `GET /api/products` route — must JOIN with BranchStock
   - Any UI that displays product stock

### 1D: `purchaseOrderService.ts` — Fix PO receiving to use BranchStock only

**File:** `lib/db/purchaseOrderService.ts`

Check `markPurchaseOrderReceived()` (around line 291). It likely updates both BranchStock and legacy columns. Remove the legacy column writes. Ensure it:
1. Gets `branchId` from the PO record itself (`order.branchId`)
2. Calls `adjustBranchStock(branchId, itemType, itemId, quantity)` for each received item
3. Does NOT call `updateMaterialStock()` or write to `Material.stockQuantity`
4. Does NOT call WooCommerce sync

---

## Task 2: Update Remaining API Routes

**Goal:** Add branchId scoping to the 9 API routes that are still global.

**Pattern for all routes:**
- Import `getBranchIdFromRequest` from `lib/api/branchHelper.ts`
- Call it at the top of each handler: `const branchId = getBranchIdFromRequest(request)`
- For GET routes: add `WHERE branchId = ?` filter
- For POST routes: include `branchId` in the INSERT

### 2A: Order creation — `app/api/orders/create-with-payment/route.ts`

This is the most critical route. When a POS order is created:
1. Get `branchId` from request header
2. Include `branchId` in the Order INSERT
3. Include `branchId` in all OrderItem INSERTs
4. The consumption recording (if called from here) must pass `branchId`

### 2B: Order listing — `app/api/admin/orders/route.ts`

Add `WHERE branchId = ?` filter to the order listing query. Accept optional `branchId` query param for admin views that want to see all branches.

### 2C: Sales reports — `app/api/admin/sales/route.ts`

Filter aggregations by `branchId`. The SQL queries that SUM revenue/costs need `WHERE o.branchId = ?`.

### 2D: Daily sales — `app/api/admin/sales/daily/route.ts`

Same pattern as 2C — add branchId filter to the daily aggregation queries.

### 2E: Daily stats — `app/api/admin/daily-stats/route.ts`

Add branchId filter to the dashboard stats queries (today's revenue, order count, etc.).

### 2F: Products sold — `app/api/admin/products-sold/route.ts`

Add branchId filter to the product sales analysis queries.

### 2G: Materials listing — `app/api/admin/materials/route.ts`

Currently returns `Material.stockQuantity`. Must JOIN with BranchStock to return branch-specific stock:
```sql
SELECT m.*, COALESCE(bs.stockQuantity, 0) as stockQuantity, COALESCE(bs.lowStockThreshold, 0) as lowStockThreshold
FROM Material m
LEFT JOIN BranchStock bs ON bs.itemId = m.id AND bs.itemType = 'material' AND bs.branchId = ?
```

### 2H: Products listing — `app/api/products/route.ts`

Same pattern as 2G — JOIN with BranchStock to return branch-specific stock quantities.

### 2I: COGS calculation — `app/api/products/[id]/cogs/route.ts`

The COGS calculation itself doesn't need branch scoping (it's recipe-based, recipes are global). But if it shows current stock levels, those should come from BranchStock.

---

## Task 3: Update Remaining Frontend Pages

**Goal:** Make the 5 untouched frontend pages use `branchFetch()` from `branchContext.tsx`.

**Pattern for all pages:**
- Import `useBranch` from `context/branchContext.tsx`
- Replace `fetch()` calls with `branchFetch()` (which auto-adds `X-Branch-Id` header)
- The branch context already handles persistence via sessionStorage

### 3A: POS page — `app/admin/pos/page.tsx`

This is the main POS interface (28KB). Key changes:
- Order creation must use `branchFetch()` so orders are tagged with branchId
- Product listing should show branch-specific stock (if stock display exists)
- Cart operations stay local (no branch isolation needed)

### 3B: Orders page — `app/admin/orders/page.tsx`

Replace `fetch()` with `branchFetch()` for order listing. Orders should be filtered by current branch.

### 3C: Sales page — `app/admin/sales/page.tsx`

Replace `fetch()` with `branchFetch()` for sales report data.

### 3D: Daily sales page — `app/admin/sales/daily/page.tsx`

Replace `fetch()` with `branchFetch()` for daily sales data.

### 3E: Materials page — `app/admin/materials/page.tsx`

Replace `fetch()` with `branchFetch()`. Stock quantities displayed should now come from BranchStock (via the updated API from Task 2G).

---

## Task 4: PO Number Branch Prefix

**Goal:** Change PO number format from `PO-YYYY-MM-NNNN` to `{BRANCH_CODE}-PO-YYYY-MM-NNNN`.

**File:** `lib/db/purchaseOrderSchema.ts`

Changes to `generatePONumber()`:
1. Accept a `branchCode: string` parameter
2. Change the format: `${branchCode}-PO-${year}-${month}-${sequence}`
3. The sequence counter query must include the branch prefix to avoid collisions:
   ```sql
   SELECT poNumber FROM PurchaseOrder
   WHERE poNumber LIKE '${branchCode}-PO-${year}-${month}-%'
   ORDER BY poNumber DESC LIMIT 1
   ```

**Callers:** `purchaseOrderService.createPurchaseOrder()` — must pass branch code. Get it from the branch record using `branchId`.

---

## Task 5: PDFs and Receipts — Add Branch Info

**Goal:** All generated documents should show branch name, address, and phone.

### 5A: PO PDF — `app/api/purchase-orders/[id]/pdf/route.ts`

Look up the PO's branch (via `order.branchId`), include branch name/address in the PDF header.

### 5B: Stock check PDF — `app/api/admin/stock-check/pdf/route.ts` (if it exists)

Same pattern — include branch info from the stock check's branchId.

### 5C: Receipts — `lib/receiptGenerator.ts`

This may already be done (fork had it). Verify that receipt generation includes branch name/address/phone in the header. If already done, no action needed.

---

## Task 6: Branch Indicator in Admin Header

**Goal:** Show the current branch name/code in the admin layout header so operators always know which branch they're on.

**File:** `app/admin/layout.tsx` or the shared admin header component

Add a small badge/indicator showing the current branch name. Use `useBranch()` from branchContext.

---

## Task 7: Legacy Column Aggregation

**Goal:** Make `Material.stockQuantity` and `Product.stockQuantity` reflect total stock across all branches (for any remaining code that reads them, and as a safety net).

**Approach:** Create a utility function that updates legacy columns as `SUM(BranchStock.stockQuantity)` grouped by itemId:

```typescript
export function syncLegacyStockColumns(): void {
  db.exec(`
    UPDATE Material SET stockQuantity = COALESCE(
      (SELECT SUM(bs.stockQuantity) FROM BranchStock bs
       WHERE bs.itemType = 'material' AND bs.itemId = Material.id), 0
    )
  `);
  db.exec(`
    UPDATE Product SET stockQuantity = COALESCE(
      (SELECT SUM(bs.stockQuantity) FROM BranchStock bs
       WHERE bs.itemType = 'product' AND bs.itemId = Product.id), 0
    ) WHERE manageStock = 1
  `);
}
```

Call this:
- After PO receiving
- After stock checks
- On a periodic basis (or on admin dashboard load)
- NOT on every sale (too frequent)

This is a safety net, not the primary mechanism. If a code path reads Material.stockQuantity directly, it gets a reasonable aggregate rather than corrupt data.

---

## Task 8: Schema Additions

**Goal:** Add timezone column to Branch table (future use only).

**File:** `lib/db/init.ts`

Add a migration:
```typescript
try {
  const tableInfo = db.prepare("PRAGMA table_info(Branch)").all() as any[];
  const hasTimezone = tableInfo.some((col: any) => col.name === 'timezone');
  if (tableInfo.length > 0 && !hasTimezone) {
    db.exec(`ALTER TABLE Branch ADD COLUMN timezone TEXT DEFAULT 'Asia/Kuala_Lumpur'`);
  }
} catch (e) {}
```

No service or UI changes — just the column.

---

## Execution Order

Tasks should be executed in this order (dependencies noted):

1. **Task 1** (Critical) — Eliminate legacy stock writes. Must be done first because everything else depends on BranchStock being the sole source of truth.
2. **Task 8** — Schema addition (trivial, no dependencies)
3. **Task 2** — API routes (depends on Task 1 for stock-related routes 2G, 2H)
4. **Task 4** — PO number prefix (can run in parallel with Task 2)
5. **Task 3** — Frontend pages (depends on Task 2 for correct API responses)
6. **Task 5** — PDFs and receipts (independent)
7. **Task 6** — Branch indicator UI (independent)
8. **Task 7** — Legacy column aggregation (do last, as a safety net)

**Parallelizable groups:**
- Tasks 2+4+5+6 can run in parallel after Task 1
- Task 3 should follow Task 2
- Task 7 is last

---

## Constraints for All Agents

1. **Read before writing.** Always read a file before modifying it. Understand the existing patterns.
2. **Don't add WooCommerce logic.** WC is being deprecated. Remove WC calls, don't add new ones.
3. **Use existing patterns.** The codebase uses `better-sqlite3` sync API. Don't introduce async DB calls.
4. **branchId is required, not optional.** New function signatures should make branchId a required parameter. Fallback to default branch happens at the API/request layer (in `getBranchIdFromRequest`), not in service functions.
5. **Don't add cart-per-branch logic.** Not in scope for this phase.
6. **Don't touch recipes or product catalog.** These are global and unchanged.
7. **Use transactions for multi-step stock operations.** If a function updates multiple BranchStock rows, wrap in `db.transaction()`.
8. **Follow existing code style.** No new linting rules, no added type annotations on code you didn't change, no docstrings on existing functions.
9. **Build must pass.** Run `npm run build` after changes. Fix any TypeScript errors.
10. **Commit to branch `claude/pos-multi-branch-support-YS4Qr`.** Push when the task is complete.
