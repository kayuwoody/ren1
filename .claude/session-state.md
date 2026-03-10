# Session State: Multi-Branch Planning

## ⚠️ READ THIS FIRST — EVERY TIME

- **You are the ARCHITECT.** This is a planning-only session. You do NOT write code on this branch.
- **Sub-agents do all implementation.** You write instruction docs, review findings, and decide next steps.
- **The sub-agent's code branch is `claude/fork-multi-branch-kR5aM`.** That's where all implementation lives. A worktree copy exists at `.claude/worktrees/agent-af250b7d/`.
- **Our branch (`claude/pos-multi-branch-support-YS4Qr`) is planning-only.** It holds spec docs, instruction docs, and review findings. No code changes.
- **On every session resume:** Read this file first, then tell the user what you understand the current status to be and ask them to confirm before taking any action.

---

**Last updated:** 2026-03-10

## Resume Here

**Status:** Round 3 fixes A-H implemented on code branch. Review in progress.

**What just happened (chronological):**
1. Sub-agent did Round 1 implementation → we reviewed → found gaps
2. We wrote `MULTI_BRANCH_AGENT_INSTRUCTIONS.md` with fix instructions
3. Sub-agent did Round 2 fixes → we reviewed → `REVIEW_FINDINGS_FORK.md` has results
4. We wrote `ROUND3_FIX_INSTRUCTIONS.md` with targeted fixes A-H
5. Sub-agent attempted Round 3 in worktree — completed A-C but skipped D-H, couldn't push (403)
6. We mistakenly implemented Round 3 directly on this planning branch — then reverted
7. Code exists only in the worktree at `.claude/worktrees/agent-af250b7d/` (commit `643c3db` for A-C)
8. Review agent dispatched to audit the code branch implementation

**What needs to happen next:**
1. IN PROGRESS — Review agent auditing Round 3 code in the worktree
2. Determine which fixes (D-H) still need to be implemented on the code branch
3. Dispatch sub-agent to complete remaining fixes on `claude/fork-multi-branch-kR5aM`

**Important note:** The worktree has Round 3 fixes A-C (commit `643c3db`). Fixes D-H were NOT done by the sub-agent — they need a new sub-agent dispatch.

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
- **CRITICAL-1:** 5 API routes query WooCommerce instead of local SQLite
- **CRITICAL-2:** `create-with-payment` doesn't INSERT into local Order table
- **CRITICAL-3:** stock-check route dual-writes (legacy + BranchStock + WC)
- **CRITICAL-4:** `update-stock` route bypasses BranchStock entirely

## Round 3 Sub-Agent Status

The sub-agent in worktree (`agent-af250b7d`) completed:
- **Fix A:** ✅ Created `orderService.ts`, updated `create-with-payment`
- **Fix B:** ✅ Rewrote 5 admin routes to use local SQLite
- **Fix C:** ✅ Stock-check route cleaned up

NOT completed by sub-agent:
- **Fix D:** ❌ `update-stock` route not touched
- **Fix E:** ❌ `materialService` not touched
- **Fix F:** ❌ `productService` not touched
- **Fix G:** ❌ Stock-check PDF — no branch info added
- **Fix H:** ❌ No admin layout branch indicator

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
