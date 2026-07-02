# TODO / Backlog — Coffee Oasis POS

Deferred, non-critical work. Each item is safe to leave; none block operation.
Newest context at the top of each entry. When you pick one up, move it to a
"Done" note with the date and commit.

---

## 1. Material initial-stock quirk (INSERT legacy write)

**Priority:** Low · **Risk to fix:** Low–Medium (touches stock write path) · **Benefit:** Low
**Source:** Round 6 review, finding #7 (`ROUND6_REVIEW_FINDINGS.md`)

**Problem:** When a new material is created via the Materials admin form with a
non-zero starting stock, `upsertMaterial()` writes that value to the legacy
`Material.stockQuantity` column, but `initBranchStockForItem('material', id)`
seeds BranchStock at 0. BranchStock is the source of truth, so the next
`syncLegacyStockColumns()` overwrites the legacy column back to 0 — the initial
stock silently disappears from the display.

**Files:** `lib/db/materialService.ts` (`upsertMaterial` INSERT branch, ~line 94),
`lib/db/branchStockService.ts` (`initBranchStockForItem`).

**Why deferred:** The correct fix needs a branch decision — which branch(es)
receive the initial quantity? `upsertMaterial` has no `branchId` param today.
Currently single-branch, and stock is normally added via stock-check counts or
purchase orders, so the quirk rarely bites.

**Options when picked up:**
- (a) Seed BranchStock with the initial quantity for `branch-main` after
  `initBranchStockForItem` on create.
- (b) Add a `branchId` param to `upsertMaterial` and seed that branch.
- (c) Remove the stock input from the create form and require initial stock to
  go through the stock-check / purchase-order flow (cleanest conceptually).

---

## 2. COGS aggregation consolidation (DRY)

**Priority:** Low · **Risk to fix:** Medium (touches verified reporting routes) · **Benefit:** Maintainability only
**Source:** Round 6 review, finding #9 (`ROUND6_REVIEW_FINDINGS.md`)

**Problem:** The same per-order COGS aggregation pattern (fetch consumptions via
`getOrderConsumptions(orderId)`, sum `totalCost`, filter by `orderItemId` for
item-level COGS, compute profit/margin) is duplicated across three reporting
routes. Any change to COGS logic must be replicated in all three.

**Duplicated in:**
- `app/api/admin/sales/route.ts`
- `app/api/admin/sales/daily/route.ts`
- `app/api/admin/products-sold/route.ts`

(Note: `app/api/online-orders/[orderId]/route.ts` also calls
`getOrderConsumptions` but only as an existence guard — not part of this dup.)

**Why deferred:** Purely a DRY/maintainability win, no correctness issue. The
routes were recently verified working (expanded products report, daily profit),
so a refactor carries regression risk with little functional upside.

**Approach when picked up:** Extract `getOrderCOGS(orderId): { total: number;
byItemId: Map<string, number> }` into `lib/db/orderService.ts`. Refactor each
route to use it and diff report output before/after to confirm identical
numbers.

---

## Notes

- Full audit context and the "keep / false-alarm" decisions live in
  `ROUND6_REVIEW_FINDINGS.md`.
- WooCommerce is fully removed; BranchStock is the sole source of truth for
  stock; both critical transaction wrappers are in place.
