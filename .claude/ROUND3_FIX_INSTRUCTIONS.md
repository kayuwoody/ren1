# Round 3 Fix Instructions — Multi-Branch Implementation

**Branch:** `claude/fork-multi-branch-kR5aM` (your existing code — continue building here)
**Purpose:** Targeted fixes for issues found in Round 2 review. Do NOT redo passing tasks.

**Reference docs:**
- Spec: `docs/MULTI_BRANCH_IMPLEMENTATION.md`
- Round 2 review: `.claude/REVIEW_FINDINGS_FORK.md`
- Architecture decisions: `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` § "Architectural Decisions"

---

## Architectural Reminders (locked — do not deviate)

1. **BranchStock is the sole source of truth for stock.** Legacy columns (`Material.stockQuantity`, `Product.stockQuantity`) are computed aggregates only — updated via `syncLegacyStockColumns()`, never written to directly.
2. **WooCommerce is being deprecated.** Remove WC sync calls from stock operations. Do not add new WC integration. Order/sales data must come from local SQLite, not WC API calls.
3. **branchId is required in service functions.** Fallback to default branch happens at the API/request layer only.
4. **Use existing patterns.** `better-sqlite3` sync API. Wrap multi-step stock ops in `db.transaction()`.

---

## Fix A (CRITICAL): Local Order Storage

**Problem:** `create-with-payment` creates WC orders and tags them with `_branch_id` meta_data, but does NOT insert into the local SQLite Order table. The local Order table (with branchId column) exists but is never populated.

**What to do:**

### A1: Create `lib/db/orderService.ts`

Create a new service with these functions:

```typescript
interface CreateLocalOrderInput {
  wcId: number;
  orderNumber: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod?: string;
  notes?: string;
  branchId: string;
  items: CreateLocalOrderItemInput[];
}

interface CreateLocalOrderItemInput {
  wcProductId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unitCost?: number;
  totalCost?: number;
}

// Insert order + items in a transaction. Returns the order ID.
export function createLocalOrder(input: CreateLocalOrderInput): string

// Get order by ID (with items)
export function getLocalOrder(id: string): Order | null

// List orders for a branch, with date range and pagination
export function listLocalOrders(branchId: string, options?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): { orders: Order[]; total: number }

// Get aggregated sales data for a branch
export function getSalesData(branchId: string, startDate: string, endDate: string): SalesData

// Get daily sales breakdown for a branch
export function getDailySales(branchId: string, startDate: string, endDate: string): DailySalesData[]

// Get daily stats (today's revenue, order count, etc.)
export function getDailyStats(branchId: string, date: string): DailyStats

// Get products sold breakdown for a branch
export function getProductsSold(branchId: string, startDate: string, endDate: string): ProductSoldData[]
```

The query functions should return the same shape of data that the current WC-based routes return, so the frontend doesn't need changes.

**Important:** Generate a UUID for the local order `id`. Store the WC order ID in `wcId` for reference. Include `branchId` in both Order and OrderItem INSERTs.

### A2: Update `app/api/orders/create-with-payment/route.ts`

After the WC order is created successfully, also insert into local Order table:

```typescript
import { createLocalOrder } from '@/lib/db/orderService';

// After WC order creation succeeds:
createLocalOrder({
  wcId: wcOrder.id,
  orderNumber: String(wcOrder.number),
  status: wcOrder.status,
  customerName: customerName,
  customerPhone: customerPhone,
  subtotal: parseFloat(wcOrder.subtotal),
  tax: parseFloat(wcOrder.total_tax),
  total: parseFloat(wcOrder.total),
  paymentMethod: paymentMethod,
  branchId: branchId,
  items: cartItems.map(item => ({
    wcProductId: item.id,
    productName: item.name,
    quantity: item.quantity,
    unitPrice: item.price,
    totalPrice: item.price * item.quantity,
  })),
});
```

Keep the WC order creation for now (it's still needed for payment processing). The local insert is additive — it does not replace the WC call yet.

---

## Fix B (CRITICAL): Rewrite 5 Order/Sales API Routes

**Problem:** These 5 routes fetch all orders from WooCommerce via `fetchAllWooPages()` and filter by `_branch_id` meta_data in JavaScript. They must query the local Order table instead.

**Pattern for all 5 routes:**
- Remove `fetchAllWooPages()` calls
- Remove WC meta_data filtering logic
- Import query functions from `lib/db/orderService.ts` (created in Fix A)
- Use `getBranchIdFromRequest(request)` to get branchId (already done in these routes)
- Call the appropriate orderService function

### B1: `app/api/admin/orders/route.ts`

Replace WC fetch + filter with:
```typescript
import { listLocalOrders } from '@/lib/db/orderService';
const { orders, total } = listLocalOrders(branchId, { startDate, endDate, status, limit, offset });
```

### B2: `app/api/admin/sales/route.ts`

Replace WC fetch + aggregation with:
```typescript
import { getSalesData } from '@/lib/db/orderService';
const salesData = getSalesData(branchId, startDate, endDate);
```

The sales route currently computes revenue, costs, margins from WC order data + local InventoryConsumption. The new `getSalesData()` function should JOIN Order with InventoryConsumption to compute the same metrics locally.

### B3: `app/api/admin/sales/daily/route.ts`

Replace with:
```typescript
import { getDailySales } from '@/lib/db/orderService';
const dailySales = getDailySales(branchId, startDate, endDate);
```

### B4: `app/api/admin/daily-stats/route.ts`

Replace with:
```typescript
import { getDailyStats } from '@/lib/db/orderService';
const stats = getDailyStats(branchId, today);
```

### B5: `app/api/admin/products-sold/route.ts`

Replace with:
```typescript
import { getProductsSold } from '@/lib/db/orderService';
const productsSold = getProductsSold(branchId, startDate, endDate);
```

**CRITICAL:** The response shape from these new functions MUST match what the frontend currently expects. Read each route's current response format carefully before replacing.

---

## Fix C (CRITICAL): Stock Check Route — Remove Legacy Writes + WC Sync

**File:** `app/api/admin/stock-check/route.ts`

**Problem:** The POST handler currently:
- Calls `updateMaterialStock()` (writes to `Material.stockQuantity`)
- Does `db.prepare('UPDATE Product SET stockQuantity = ?')` (writes to `Product.stockQuantity`)
- Calls `wcApi.put()` to sync stock to WooCommerce
- ALSO updates BranchStock (correct)

**What to do:**
1. Remove the `updateMaterialStock()` call — BranchStock update is sufficient
2. Remove the raw `UPDATE Product SET stockQuantity = ?` SQL — BranchStock update is sufficient
3. Remove the `wcApi.put()` call — WC is being deprecated
4. After all BranchStock updates are done, call `syncLegacyStockColumns()` once at the end (not per item)
5. Remove `wcApi` import if no longer used in this file

---

## Fix D (CRITICAL): Update-Stock Route — Use BranchStock

**File:** `app/api/products/update-stock/route.ts`

**Problem:** This route was not touched in Round 2. It writes directly to `Product.stockQuantity` and syncs to WooCommerce. Does not update BranchStock at all.

**What to do:**
1. Import `getBranchIdFromRequest` from `lib/api/branchHelper.ts`
2. Import `updateBranchStock` from `lib/db/branchStockService.ts`
3. Get `branchId` from request: `const branchId = getBranchIdFromRequest(request)`
4. Replace the `UPDATE Product SET stockQuantity = ?` with `updateBranchStock(branchId, 'product', productId, newQuantity)`
5. Remove the `wcApi.put()` WC sync call
6. Call `syncLegacyStockColumns()` after the update
7. Remove `wcApi` import if no longer used

---

## Fix E (MEDIUM): materialService.ts — Clean Up Legacy Functions

**File:** `lib/db/materialService.ts`

**Problem:** Three functions still use legacy patterns.

### E1: Remove `updateMaterialStock()`

This function writes directly to `Material.stockQuantity`. All callers should already be using `adjustBranchStock()` or `updateBranchStock()` after Fixes A-D.

1. Delete the `updateMaterialStock()` function
2. Search for any remaining callers — if found, redirect them to branchStockService functions
3. If the stock-check route (Fix C) was the last caller, it should already be fixed

### E2: Redirect `getLowStockMaterials()`

Currently queries `Material.stockQuantity`. Replace with a branch-aware query:

```typescript
export function getLowStockMaterials(branchId: string) {
  return getLowStockItems(branchId, 'material');
}
```

Import `getLowStockItems` from `branchStockService.ts` (already exists).

### E3: Create BranchStock for New Materials

In `upsertMaterial()`, after inserting a new material, also create a BranchStock entry:

```typescript
import { initBranchStockForItem } from '@/lib/db/branchStockService';

// After INSERT of new material:
if (isNewMaterial) {
  initBranchStockForItem('material', materialId);
}
```

If `initBranchStockForItem` doesn't exist, create it in branchStockService.ts — it should insert a BranchStock row for each active branch with stockQuantity = 0.

---

## Fix F (LOW-MEDIUM): productService.ts — Stop Legacy Stock Writes

**File:** `lib/db/productService.ts`

**Problem:** `upsertProduct()` still writes `stockQuantity` to the Product table.

**What to do:**
1. In `upsertProduct()`, stop writing `stockQuantity` in the INSERT and UPDATE SQL. The Product table's `stockQuantity` is now a computed aggregate managed by `syncLegacyStockColumns()`.
2. In `syncProductFromWooCommerce()`, stop syncing stock from WC. Keep catalog field syncs (name, price, SKU, etc.) but skip `stockQuantity`.
3. If a new product is created via upsert, create BranchStock entries (same pattern as Fix E3).

---

## Fix G (MEDIUM): Stock Check PDF — Add Branch Info

**File:** `app/api/admin/stock-check/pdf/route.ts`

**Problem:** PO PDF and receipts have branch info, but stock-check PDF does not.

**What to do:**
1. Accept `branchId` parameter (from request header or query param)
2. Look up branch via `getBranch(branchId)` from branchService
3. Include branch name and address in the PDF header (follow the same pattern used in PO PDF)

---

## Fix H (MEDIUM): Branch Indicator in Admin Header

**Problem:** Branch selector only visible on dashboard page, not on other admin pages.

**What to do:**
1. Create `app/admin/layout.tsx` (admin layout wrapper)
2. Add a small branch badge/indicator showing the current branch name
3. Use `useBranch()` from `context/branchContext.tsx`
4. This should be a read-only indicator (not a selector) — the selector on dashboard is fine for switching
5. Show on all admin pages: orders, sales, materials, POS, etc.

---

## Execution Order

1. **Fix A** first (creates orderService.ts — prerequisite for Fix B)
2. **Fix B** next (rewrites 5 routes to use orderService)
3. **Fixes C + D** (stock routes — independent of A/B)
4. **Fixes E + F** (service cleanup — can run after C/D)
5. **Fixes G + H** (UI — independent)

**After all fixes:** Run `npm run build` to verify. Fix any TypeScript errors.

---

## What NOT to Change

These tasks passed review and must not be regressed:
- Task 1A: `inventoryConsumptionService.ts` — working correctly
- Task 1D: `purchaseOrderService.ts` — working correctly
- Task 3: All 5 frontend pages using `branchFetch()` — working correctly
- Task 4: PO number branch prefix — working correctly
- Task 7: `syncLegacyStockColumns()` — working correctly
- Task 8: Timezone migration — working correctly
