# Round 4 — Final Fix Instructions

**Purpose:** Self-contained instructions for a code agent to complete all remaining multi-branch work. Reading ONLY this doc should be sufficient.

**Branch:** `claude/fork-multi-branch-kR5aM`

**Context:** The repo has two sets of files:
- **Root-level** (`api/`, `db/`, `branchContext.tsx`, `layout.tsx`): Partial snapshot uploaded via GitHub UI. Some files contain D-H fixes, some are old unfixed copies. DO NOT trust blindly — use as reference only.
- **Proper-path** (`app/api/`, `lib/db/`, `context/`): The real project files. Some already have Round 1-3 fixes applied; others still need D-H fixes.

**Architecture rules (locked):**
1. BranchStock = sole source of truth for stock quantities
2. WooCommerce is being deprecated — remove WC sync in stock operations
3. No direct writes to `Material.stockQuantity` or `Product.stockQuantity` except in `syncLegacyStockColumns()`
4. `branchId` is required (not optional) in service functions
5. Use `db.transaction()` for multi-step stock operations

---

## PHASE 0: Infrastructure Updates

### 0A: Update `lib/db/branchStockService.ts` — Add missing functions

The proper-path file is missing two functions that the D-H fixes depend on. Add them:

**Add `getBranchStockRecord`** (after existing `getBranchStock` function):
```typescript
export function getBranchStockRecord(branchId: string, itemType: string, itemId: string): BranchStock | null {
  const row = db.prepare(
    'SELECT * FROM BranchStock WHERE branchId = ? AND itemType = ? AND itemId = ?'
  ).get(branchId, itemType, itemId) as BranchStock | undefined;
  return row ?? null;
}
```

**Add `initBranchStockForItem`** (before `syncLegacyStockColumns`):
```typescript
/**
 * Create BranchStock entries for a new item across all active branches.
 */
export function initBranchStockForItem(itemType: 'material' | 'product', itemId: string): void {
  const now = new Date().toISOString();
  const branches = db.prepare('SELECT id FROM Branch WHERE isActive = 1').all() as { id: string }[];
  for (const branch of branches) {
    db.prepare(
      'INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt) VALUES (?, ?, ?, ?, 0, 0, ?)'
    ).run(uuidv4(), branch.id, itemType, itemId, now);
  }
}
```

Note: `v4 as uuidv4` is already imported in this file.

### 0B: Create `lib/db/orderService.ts`

This file does NOT exist at the proper path. Copy it from `db/orderService.ts` (root-level). The content is correct as-is. It provides `saveOrderLocally`, `getOrders`, `getSaleOrders`, `getDayOrders`, `getDailyStats`, etc.

**After copying**, fix these issues in the new `lib/db/orderService.ts`:

1. **Wrap `saveOrderLocally` in a transaction:**
   ```typescript
   export function saveOrderLocally(wooOrder: any, branchId: string): void {
     const insertOrder = db.transaction(() => {
       // ... existing INSERT Order + INSERT OrderItem loop ...
     });
     insertOrder();
   }
   ```

2. **Make `branchId` required** in `LocalOrder` interface:
   Change `branchId?: string` to `branchId: string` (line 30).

3. **Make `branchId` required** in `LocalOrderItem` interface:
   Change `branchId?: string` to `branchId: string` (line 54).

---

## PHASE 1: Fix D — `app/api/products/update-stock/route.ts`

**Status:** UNFIXED at proper path. Root-level version is correct.

**Action:** Replace the proper-path file with the root-level `api/products/update-stock/route.ts` content.

The root-level version correctly:
- Imports `updateBranchStock` and `syncLegacyStockColumns` from branchStockService
- Imports `getBranchIdFromRequest` from branchHelper
- Uses `updateBranchStock(branchId, 'product', productId, stockQuantity)` instead of direct SQL
- Calls `syncLegacyStockColumns()` after update
- Has NO `wcApi` import or usage

No modifications needed to the root-level version — copy as-is.

---

## PHASE 2: Fix E — `lib/db/materialService.ts`

**Status:** UNFIXED at proper path. Root-level version is partially correct.

**Action:** Update the proper-path file with these changes:

### E1: Delete `updateMaterialStock()` function
The proper-path file still has this function (around line 239-248). Delete it entirely. No callers remain.

### E2: Fix `getLowStockMaterials()` to be branch-aware
Replace the existing function:
```typescript
export function getLowStockMaterials(branchId: string) {
  return getLowStockItems(branchId).filter(item => item.itemType === 'material');
}
```
Add import at top: `import { getLowStockItems, initBranchStockForItem } from './branchStockService';`

Note: `getLowStockItems` returns both materials and products. Filter to materials only.

### E3: Add BranchStock init for new materials
In `upsertMaterial()`, in the INSERT branch (the `else` block), after the `stmt.run(...)` call, add:
```typescript
// Create BranchStock entries for the new material across all active branches
initBranchStockForItem('material', id);
```

### E4: Stop writing `stockQuantity` in UPDATE path
In `upsertMaterial()`, UPDATE SQL (the `if (existing)` block):
- Remove `stockQuantity = ?,` from the SET clause
- Remove `material.stockQuantity,` from the `.run()` arguments

The UPDATE should only set catalog fields (name, category, purchaseUnit, purchaseQuantity, purchaseCost, costPerUnit, lowStockThreshold, supplier, lastPurchaseDate, updatedAt).

---

## PHASE 3: Fix F — `lib/db/productService.ts`

**Status:** UNFIXED at proper path. Root-level version is correct (with one minor issue).

**Action:** Update the proper-path file based on the root-level version:

### F1: Stop writing `stockQuantity` in UPDATE path
In `upsertProduct()` UPDATE SQL:
- Remove `stockQuantity = ?,` from SET clause
- Remove the corresponding `product.stockQuantity` from `.run()` args
- Add comment: `// do NOT write stockQuantity (managed by BranchStock)`

### F2: Hardcode `stockQuantity = 0` in INSERT path
In `upsertProduct()` INSERT SQL:
- Replace `?, ` for stockQuantity with `0, ` (hardcoded zero)
- Remove the corresponding `product.stockQuantity` from `.run()` args
- Add comment: `// stockQuantity defaults to 0 (real stock lives in BranchStock)`

### F3: Add BranchStock init for new products
After the INSERT `.run()`, add:
```typescript
// Create BranchStock entries for the new product across all active branches
if (product.manageStock) {
  initBranchStockForItem('product', id);
}
```
Add import at top: `import { initBranchStockForItem } from './branchStockService';`

### F4: Fix `syncProductFromWooCommerce`
- Line that reads WC stock: `const stockQuantity = existing?.stockQuantity ?? (wcProduct.manage_stock ? (wcProduct.stock_quantity ?? 0) : 0);`
- Change to: `const stockQuantity = existing?.stockQuantity ?? 0;`
- This preserves existing local stock or defaults to 0. Never takes WC stock.
- Fix misleading comment "Use WooCommerce stock as source of truth" → "Preserve existing stock (BranchStock is source of truth)"

---

## PHASE 4: Fix G — `app/api/admin/stock-check/pdf/route.ts`

**Status:** UNFIXED at proper path. Root-level version is partially correct (has branch header but still reads legacy columns).

**Action:** Update the proper-path file with these changes. Use the root-level `api/admin/stock-check/pdf/route.ts` as the base, then fix:

### G1: Add branch header (from root-level version)
The root-level version already has:
- `getBranchIdFromRequest(req)` to get branchId
- `getBranch(branchId)` to look up branch info
- Branch name and address rendered in PDF header

Copy these additions from the root-level version.

### G2: Read stock from BranchStock instead of legacy columns
Add import: `import { getBranchStock } from '@/lib/db/branchStockService';`

In the product loop, change:
```typescript
currentStock: product.stockQuantity,
```
to:
```typescript
currentStock: getBranchStock(branchId, 'product', product.id),
```

In the material loop, change:
```typescript
currentStock: material.stockQuantity,
```
to:
```typescript
currentStock: getBranchStock(branchId, 'material', material.id),
```

### G3: Accept request parameter
The function signature must accept `req: Request` (like in the root-level version):
```typescript
export async function GET(req: Request) {
```

---

## PHASE 5: Fix H — `app/admin/layout.tsx`

**Status:** Does NOT exist at proper path.

**Action:** Create `app/admin/layout.tsx` from the root-level `layout.tsx`. Content is correct as-is:

```tsx
'use client';

import React from 'react';
import { useBranch } from '@/context/branchContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentBranch, isLoading } = useBranch();

  return (
    <div>
      {!isLoading && currentBranch && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 flex items-center gap-2 text-sm text-blue-700">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
          <span className="font-medium">{currentBranch.name}</span>
          {currentBranch.code && (
            <span className="text-blue-400">({currentBranch.code})</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
```

**Important:** Verify this doesn't conflict with any existing layout in `app/admin/`. If `app/admin/` already has a layout that wraps pages, this needs to be integrated into that layout rather than creating a new one.

---

## PHASE 6: Fix A-C Issues (Medium Priority)

### 6A: Wrap stock-check POST in transaction
**File:** `app/api/admin/stock-check/route.ts`

In the POST handler, wrap the update loop in a transaction:
```typescript
const runUpdates = db.transaction(() => {
  for (const update of updates) {
    // ... existing loop body ...
  }
});
runUpdates();
```

Import `db` from `@/lib/db/init` if not already imported.

### 6B: Make `create-with-payment` use proper orderService import
**File:** `app/api/orders/create-with-payment/route.ts`

Verify that `saveOrderLocally` is imported from `@/lib/db/orderService` (the file we're creating in Phase 0B). Currently the root-level version imports from `@/lib/db/orderService` which is correct once we create the file.

---

## PHASE 7: Cleanup

### 7A: Delete root-level duplicate files
After all proper-path files are updated, delete the root-level duplicates:
```bash
rm -rf api/ db/ branchContext.tsx layout.tsx
```

These were uploaded at wrong paths and are no longer needed.

---

## PHASE 8: Build Verification

Run `npm run build` and fix any TypeScript errors.

Common issues to watch for:
- Missing imports (initBranchStockForItem, getLowStockItems, getBranchStock)
- Type mismatches if `branchId` changed from optional to required
- Callers of deleted `updateMaterialStock()` — should be none, but verify

---

## Summary Checklist

| Fix | Status | Action | Phase |
|-----|--------|--------|-------|
| 0A: branchStockService additions | MISSING | Add `initBranchStockForItem` + `getBranchStockRecord` | 0 |
| 0B: orderService at proper path | MISSING | Copy from root + add transaction + fix types | 0 |
| D: update-stock route | UNFIXED | Replace from root-level version | 1 |
| E1: Delete updateMaterialStock | UNFIXED | Delete function | 2 |
| E2: getLowStockMaterials branch-aware | UNFIXED | Redirect + filter by material | 2 |
| E3: Init BranchStock for new materials | UNFIXED | Add initBranchStockForItem call | 2 |
| E4: Stop stockQuantity write in UPDATE | UNFIXED | Remove from SET clause | 2 |
| F1: Stop stockQuantity write in UPDATE | UNFIXED | Remove from SET clause | 3 |
| F2: Hardcode 0 in INSERT | UNFIXED | Hardcode instead of param | 3 |
| F3: Init BranchStock for new products | UNFIXED | Add initBranchStockForItem call | 3 |
| F4: Fix WC sync stock logic | UNFIXED | Stop reading WC stock | 3 |
| G1: Branch header in PDF | UNFIXED | Add from root-level version | 4 |
| G2: Read BranchStock in PDF | UNFIXED | Replace legacy column reads | 4 |
| G3: Accept request param | UNFIXED | Change function signature | 4 |
| H: Admin layout | MISSING | Create from root-level version | 5 |
| A1/C1: Transactions | PRESENT | Wrap in db.transaction() | 6 |
| 7A: Cleanup root-level files | N/A | Delete duplicates | 7 |
| 8: Build verification | N/A | npm run build | 8 |

---

## What NOT to Touch

These are already correct at proper paths:
- `app/api/admin/stock-check/route.ts` — Uses BranchStock (Round 2-3 fix)
- `lib/db/purchaseOrderService.ts` — Uses adjustBranchStock (Round 2 fix)
- `lib/db/inventoryConsumptionService.ts` — Uses adjustBranchStock (Round 2 fix)
- `context/branchContext.tsx` — Correct (Round 2)
- All 5 admin reporting routes (orders, sales, daily, daily-stats, products-sold) — Correct (Round 3)
- `app/api/orders/create-with-payment/route.ts` — Correct except orderService import path (Round 3)
