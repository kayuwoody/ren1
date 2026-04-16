# Session State: Multi-Branch Implementation Review

## READ THIS FIRST — EVERY TIME

- **You are the ARCHITECT.** This session reviews implementation code and produces instruction docs.
- **Code branch:** `claude/fork-multi-branch-kR5aM`
- **Your push branch:** `claude/review-session-state-vR06M`
- **On every session resume:** Read this file first, summarize status, ask user to confirm.

---

**Last updated:** 2026-04-16

## Resume Here

**Status:** Round 4 COMPLETE. Objectives review COMPLETE. **BUT Round 5 needed — 7 admin routes still call WooCommerce despite prior review claims.**

### ⛔ CRITICAL FINDING (2026-04-16)

Round 3 review was **wrong**: the admin routes were never actually migrated to SQLite. User hit runtime error on offline branch: `getaddrinfo ENOTFOUND coffee-oasis.com.my` from `/api/admin/sales`.

**Infrastructure exists** (`lib/db/orderService.ts` has `getOrders`, `getSaleOrders`, `getDayOrders`, `getDailyStats`, `saveOrderLocally`) but is **unused by these 7 routes**:

| Route | Line | Call |
|---|---|---|
| `app/api/admin/sales/route.ts` | 90 | `fetchAllWooPages('orders',...)` |
| `app/api/admin/sales/daily/route.ts` | 52 | `fetchAllWooPages('orders',...)` |
| `app/api/admin/orders/route.ts` | 32 | `fetchAllWooPages('orders',...)` |
| `app/api/admin/daily-stats/route.ts` | 45,51 | `fetchAllWooPages('orders',...)` |
| `app/api/admin/products-sold/route.ts` | 112 | `fetchAllWooPages('orders',...)` |
| `app/api/admin/customers/route.ts` | 11 | `fetchAllWooPages('customers',...)` |
| `app/api/admin/products/costs/route.ts` | 12 | `fetchAllWooPages('products',...)` |

**Next action:** Dispatch code agent to migrate order-based routes to `orderService.ts`. Decide on customers/products routes separately.

**Rounds completed:**
- Rounds 1-3: Schema, BranchStock service, branchContext, API route scoping, inventory consumption, PO receiving
- Round 4: Fixes D-H (materialService, productService, stock-check PDF, admin layout, transactions, cleanup)
- Objectives review: 27/28 items DONE, 1 PARTIAL (low-impact), 1 minor gap

### Remaining Gaps (low priority)

1. **3E (PARTIAL):** `app/admin/materials/page.tsx` — DELETE/POST/PUT use plain `fetch` instead of `branchFetch`. Low impact because materials are a global catalog and `initBranchStockForItem` on the server handles branch stock init regardless. But for consistency, write calls should use `branchFetch`.

2. **2E (minor):** `app/api/admin/daily-stats/route.ts` — `pendingOrders` count not branch-filtered. Main stats (revenue, items sold) are correctly scoped.

### Objectives Review Results (all 8 tasks)

| Task | Description | Status |
|------|-------------|--------|
| 1: Legacy stock writes | BranchStock = sole source of truth | **DONE** (all 4 sub-tasks) |
| 2: API route scoping | 9 routes with branchId | **DONE** (8/9; COGS is N/A) |
| 3: Frontend branchFetch | 5 pages | **DONE** (4 full + 1 partial) |
| 4: PO number prefix | `{BRANCH_CODE}-PO-YYYY-MM-NNNN` | **DONE** |
| 5: PDFs/receipts | Branch info in headers | **DONE** (all 3) |
| 6: Branch indicator | Admin layout banner | **DONE** |
| 7: syncLegacyStockColumns | Aggregate safety net | **DONE** (3 call sites) |
| 8: Schema (timezone) | Branch table column | **DONE** |

### Cross-cutting verification (all PASS)
- Zero `updateMaterialStock` live calls in codebase
- Zero `wcApi` references in stock operations
- `UPDATE...SET...stockQuantity` only in `syncLegacyStockColumns()` in branchStockService.ts
- `branchId` required (not optional) in LocalOrder/LocalOrderItem
- `saveOrderLocally` wrapped in `db.transaction()`
- Stock-check POST loop wrapped in `db.transaction()`

---

## Key Files

| File | Purpose |
|------|---------|
| `.claude/ROUND4_FIX_INSTRUCTIONS.md` | Round 4 instructions (executed) |
| `.claude/ROUND3_5_INSTRUCTIONS.md` | Review checklist (completed) |
| `.claude/ROUND3_REVIEW_FINDINGS.md` | Round 3 review findings |
| `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` | Original Round 2 instructions (Tasks 1-8 spec) |

---

## Resolved Architectural Decisions (locked)

1. **BranchStock-only** — sole source of truth. Legacy columns = computed aggregates.
2. **WooCommerce** — being deprecated. Remove WC sync calls. Don't add new WC logic.
3. **PO numbers** — globally unique, branch-prefixed: `{BRANCH_CODE}-PO-YYYY-MM-NNNN`
4. **Timezone** — UTC+8 hardcoded.
5. **Suppliers** — global scope, no changes.
6. **Cart isolation** — not in scope. Each local POS server = one branch.
7. **Products, recipes, materials** — global shared catalog.

---

## Process Rules

- Always write findings to files immediately
- Before major actions, state which files you're looking at (root-level vs proper-path)
- If findings contradict earlier discussion, STOP and reconcile
- Update this file at every meaningful transition point
- On context reset: read this file FIRST
