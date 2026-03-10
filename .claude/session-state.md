# Session State: Multi-Branch Planning

## ⚠️ READ THIS FIRST — EVERY TIME

- **You are the ARCHITECT.** This is a planning-only session. You do NOT write code, merge branches, or implement anything.
- **Sub-agents do all implementation.** You write instruction docs, review findings, and decide next steps.
- **The sub-agent's code branch is `claude/fork-multi-branch-kR5aM`.** That's where all implementation lives. Let it continue building there.
- **Our branch (`claude/pos-multi-branch-support-YS4Qr`) is planning-only.** It holds spec docs, instruction docs, and review findings. No code changes.
- **On every session resume:** Read this file first, then tell the user what you understand the current status to be and ask them to confirm before taking any action. Do NOT claim you have context. Do NOT act until confirmed.

---

**Last updated:** 2026-03-10

## Resume Here

**Status:** Drafting Round 3 fix instruction doc (`ROUND3_FIX_INSTRUCTIONS.md`).

**What just happened:**
- Sub-agent did Round 1 implementation → we reviewed → found gaps
- We wrote `MULTI_BRANCH_AGENT_INSTRUCTIONS.md` with fix instructions
- Sub-agent did Round 2 fixes → we reviewed → `REVIEW_FINDINGS_FORK.md` has the results
- Research complete: local Order table exists with branchId column, but is NEVER populated. No orderService in lib/db/. All 5 order/sales routes query WC exclusively. No sync mechanism exists.

**What needs to happen next:**
1. ✅ Research done — understand the gaps
2. IN PROGRESS — Writing `ROUND3_FIX_INSTRUCTIONS.md` (targeted fixes for sub-agent on its branch)
3. Dispatch sub-agent to `claude/fork-multi-branch-kR5aM` to execute Round 3

**Round 3 doc structure (if drafting is interrupted):**
- Fix A (CRITICAL): Create `lib/db/orderService.ts` — local Order/OrderItem INSERT function. Update `create-with-payment` to call it.
- Fix B (CRITICAL): Rewrite 5 order/sales API routes to query local Order table with `WHERE branchId = ?` instead of WC.
- Fix C (CRITICAL): stock-check route — remove legacy column direct writes + WC sync, use BranchStock + syncLegacyStockColumns()
- Fix D (CRITICAL): update-stock route — redirect to BranchStock, remove WC sync
- Fix E (PARTIAL): materialService — remove updateMaterialStock(), redirect getLowStockMaterials(), create BranchStock on new material
- Fix F (PARTIAL): productService — stop writing legacy stockQuantity in upsertProduct()
- Fix G (PARTIAL): stock-check PDF — add branch info
- Fix H (PARTIAL): branch indicator — add to admin header/layout, not just dashboard

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/MULTI_BRANCH_IMPLEMENTATION.md` | Full spec doc |
| `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` | Round 2 instruction doc (8 tasks) |
| `.claude/REVIEW_FINDINGS_FORK.md` | Round 2 review results |
| `.claude/REVIEW_FINDINGS.md` | ❌ STALE — reviewed wrong branch, ignore this file |

---

## Round 2 Review Summary (from `REVIEW_FINDINGS_FORK.md`)

### Passes (no further work needed)
- **1A:** inventoryConsumptionService — fully refactored, BranchStock only
- **1D:** purchaseOrderService — PO receiving uses BranchStock only
- **3:** All 5 frontend pages use branchFetch()
- **4:** PO number branch prefix format correct
- **7:** syncLegacyStockColumns exists and works
- **8:** Timezone migration done

### Partial (needs targeted fixes)
- **1B:** materialService — `updateMaterialStock()` not removed, `getLowStockMaterials()` not redirected, `upsertMaterial()` doesn't create BranchStock for new materials
- **1C:** productService — `upsertProduct()` still writes legacy stockQuantity column
- **5:** PO PDF and receipts have branch info, but stock-check PDF does NOT
- **6:** Branch indicator only on dashboard, NOT in persistent admin header

### Critical Failures (architectural violations)
- **CRITICAL-1:** 5 API routes (orders, sales, sales/daily, daily-stats, products-sold) query WooCommerce + filter by `_branch_id` meta_data in JS, instead of querying local SQLite
- **CRITICAL-2:** `create-with-payment` tags WC orders with `_branch_id` meta_data but does NOT INSERT into local Order table
- **CRITICAL-3:** stock-check route still writes to legacy columns AND syncs to WooCommerce (also uses BranchStock, so it's dual-writing)
- **CRITICAL-4:** `update-stock` route completely untouched — writes legacy columns + WC, bypasses BranchStock entirely

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
- Sub-agents do implementation. This session produces instruction docs.
- Update this file at every meaningful transition point
- On context reset: read this file FIRST, then ask user to confirm before acting
