# Session State: Multi-Branch Planning

**Last updated:** 2026-03-09
**Purpose:** Planning chat — reviewing fork branch implementation against spec, updating spec doc with findings.

## Key Context

- **Spec doc:** `docs/MULTI_BRANCH_IMPLEMENTATION.md`
- **Branch under review:** `origin/claude/fork-multi-branch-kR5aM` (implementation attempt, 22 files changed)
- **Our working branch:** `claude/pos-multi-branch-support-YS4Qr` (schema-only, spec doc lives here)
- **These are different branches.** The fork has the implementation. Our branch has the spec + schema stubs.

## What's Been Done

1. Spec doc created with full implementation plan (Steps 1-11)
2. Schema implemented on our branch: Branch table, BranchStock table, branchId migrations, branchService.ts, branchStockService.ts, branchHelper.ts
3. Fork branch reviewed by agent — found ~55-60% coverage with bugs

## Earlier Review Findings (from fork branch `claude/fork-multi-branch-kR5aM`)

### What's Done on Fork
- Schema: Complete (Branch table, BranchStock, branchId on all 7 scoped tables)
- Core services: branchService.ts, branchStockService.ts created
- Branch UI: Context, selector, management page
- Branch-aware: Stock check, purchase orders, inventory consumption use branchId + BranchStock

### Major Gaps on Fork
- 9 API routes not updated (orders, sales, daily-stats, products-sold, materials, products)
- 5 frontend pages untouched (POS, orders, sales, sales/daily, materials)
- materialService.ts and productService.ts never modified to use BranchStock
- cartContext.tsx not updated
- PO and stock check PDFs missing branch info
- Branch indicator only on dashboard, not shared admin header

### Bugs Found on Fork
1. **Legacy column corruption** — Material.stockQuantity gets overwritten with branch-specific BranchStock value during sales
2. **setDefaultBranch not transactional** — Two UPDATEs with no transaction wrapper (NOTE: this may have been fixed — branchService.ts on our branch DOES use db.transaction())
3. **No branchId validation** — getBranchIdFromRequest doesn't verify branch exists (NOTE: may have been fixed — branchHelper.ts on our branch DOES validate)
4. **Fragile positional args** — recordProductSale(orderId, ..., 0, '', branchId) is brittle

## Current Task

- **WRONG findings were written to spec doc** — based on current branch (no implementation) instead of fork branch
- Need to: Replace findings in spec doc with correct fork-branch findings
- Then: Complete the API/frontend review of fork branch
- Then: Update spec with all findings, open questions, and decisions needed

## Open Questions (need user decisions)

1. Dual-write vs BranchStock-only
2. WooCommerce multi-branch strategy
3. PO number scope (global vs branch-scoped)
4. Timezone per branch
5. Suppliers scope
6. Cart localStorage isolation

## Process Notes

- Always write findings to files immediately, don't keep them only in conversation
- Before major actions, state which branch you're looking at
- If findings contradict earlier discussion, STOP and reconcile — don't proceed
