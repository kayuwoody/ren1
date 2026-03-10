# Session State: Multi-Branch Implementation

## ⚠️ READ THIS FIRST — EVERY TIME

- **This session is ARCHITECT + IMPLEMENTOR.** As of Round 3, we implement directly on this branch.
- **Code branch: `claude/pos-multi-branch-support-YS4Qr`** — all code lives here now.
- **The old sub-agent branch `claude/fork-multi-branch-kR5aM`** is obsolete. A worktree copy exists at `.claude/worktrees/agent-af250b7d/` for reference only.
- **On every session resume:** Read this file first, then tell the user what you understand the current status to be and ask them to confirm before taking any action.

---

**Last updated:** 2026-03-10

## Resume Here

**Status:** Round 3 fixes A-H implemented and pushed. Awaiting review.

**What just happened (chronological):**
1. Sub-agent did Round 1 implementation → we reviewed → found gaps
2. We wrote `MULTI_BRANCH_AGENT_INSTRUCTIONS.md` with fix instructions
3. Sub-agent did Round 2 fixes → we reviewed → `REVIEW_FINDINGS_FORK.md` has results
4. We wrote `ROUND3_FIX_INSTRUCTIONS.md` with targeted fixes A-H
5. Sub-agent attempted Round 3 in worktree — completed A-C but skipped D-H, couldn't push (403)
6. **We implemented Round 3 directly** on `claude/pos-multi-branch-support-YS4Qr` (commit `163933c`)
7. Also ported `inventoryConsumptionService` (BranchStock-aware version) and updated its callers

**What needs to happen next:**
1. IN PROGRESS — Review agent auditing Round 3 implementation
2. Address any issues found in review
3. Final integration testing

---

## Round 3 Implementation Summary (commit `163933c`)

### New Files Created
| File | Purpose |
|------|---------|
| `lib/db/orderService.ts` | Local SQLite order queries — replaces WC API calls |
| `context/branchContext.tsx` | React context for branch selection + `branchFetch()` |
| `app/admin/layout.tsx` | Admin layout with branch indicator badge |
| `app/api/admin/branches/route.ts` | API route for listing active branches |

### Files Modified
| Fix | File | Change |
|-----|------|--------|
| A | `app/api/orders/create-with-payment/route.ts` | Added `saveOrderLocally()` call after WC order creation |
| B | `app/api/admin/orders/route.ts` | Rewrote to use `getOrders()` from orderService |
| B | `app/api/admin/sales/route.ts` | Rewrote to use `getSaleOrders()` from orderService |
| B | `app/api/admin/sales/daily/route.ts` | Rewrote to use `getDayOrders()` from orderService |
| B | `app/api/admin/daily-stats/route.ts` | Rewrote to use `getDailyStats()` from orderService |
| B | `app/api/admin/products-sold/route.ts` | Rewrote to use `getSaleOrders()` from orderService |
| C | `app/api/admin/stock-check/route.ts` | BranchStock only, removed WC sync + legacy writes |
| D | `app/api/products/update-stock/route.ts` | Uses `updateBranchStock()` + `syncLegacyStockColumns()` |
| E | `lib/db/materialService.ts` | Removed `updateMaterialStock()`, redirected `getLowStockMaterials()`, init BranchStock for new materials |
| F | `lib/db/productService.ts` | Stopped writing `stockQuantity`, stopped WC stock sync, init BranchStock for new products |
| G | `app/api/admin/stock-check/pdf/route.ts` | Branch name + address in PDF header |
| H | `app/layout.tsx` | Wrapped with `BranchProvider` |
| — | `lib/db/branchStockService.ts` | Added `syncLegacyStockColumns()` and `initBranchStockForItem()` |
| — | `lib/db/inventoryConsumptionService.ts` | Ported from worktree: BranchStock-aware, WC sync removed |
| — | `app/api/orders/consumption/route.ts` | Updated to new `recordProductSale()` options API |
| — | `app/api/debug/recreate-consumptions/route.ts` | Reads from local SQLite instead of WC API |

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/MULTI_BRANCH_IMPLEMENTATION.md` | Full spec doc |
| `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` | Round 2 instruction doc (8 tasks) |
| `.claude/ROUND3_FIX_INSTRUCTIONS.md` | Round 3 fix instructions (Fixes A-H) |
| `.claude/REVIEW_FINDINGS_FORK.md` | Round 2 review results |
| `.claude/REVIEW_FINDINGS.md` | ❌ STALE — reviewed wrong branch, ignore |

---

## Resolved Architectural Decisions (locked)

1. **BranchStock-only** — sole source of truth. Legacy columns = computed aggregates.
2. **WooCommerce** — being deprecated. Remove WC sync calls. Don't add new WC logic.
3. **PO numbers** — globally unique, branch-prefixed: `{BRANCH_CODE}-PO-YYYY-MM-NNNN`
4. **Timezone** — UTC+8 hardcoded. Schema column exists for future, not wired up.
5. **Suppliers** — global scope, no changes.
6. **Cart isolation** — not in scope. Each local POS server = one branch.
7. **Products, recipes, materials** — global shared catalog.

---

## Process Rules

- Always write findings to files immediately, not just in conversation
- Before major actions, state which branch you're looking at
- If findings contradict earlier discussion, STOP and reconcile
- Update this file at every meaningful transition point
- On context reset: read this file FIRST, then ask user to confirm before acting
