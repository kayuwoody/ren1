# Session State: Multi-Branch Planning

## ⚠️ READ THIS FIRST — EVERY TIME

- **You are the ARCHITECT.** This is a planning-only session. You do NOT write code on this branch.
- **Sub-agents do all implementation.** You write instruction docs, review findings, and decide next steps.
- **The code branch is `claude/fork-multi-branch-kR5aM`.** That's where all implementation lives.
- **Our branch (`claude/pos-multi-branch-support-YS4Qr`) is planning-only.** It holds spec docs, instruction docs, review findings, and the recovered code from commit `163933c`.
- **On every session resume:** Read this file first, then tell the user what you understand the current status to be and ask them to confirm before taking any action.

---

**Last updated:** 2026-03-11

## Resume Here

**Status:** Code recovered from `163933c`. Round 3.5 instructions created. Ready for review → Round 4 cycle.

**What happened (chronological):**
1. Sub-agent did Round 1 implementation → we reviewed → found gaps
2. We wrote `MULTI_BRANCH_AGENT_INSTRUCTIONS.md` with fix instructions
3. Sub-agent did Round 2 fixes → we reviewed → `REVIEW_FINDINGS_FORK.md` has results
4. We wrote `ROUND3_FIX_INSTRUCTIONS.md` with targeted fixes A-H
5. Sub-agent attempted Round 3 in worktree — completed A-C but skipped D-H, couldn't push (403)
6. We implemented Round 3 (all A-H) directly on this branch in commit `163933c` — then reverted it
7. Review agent reviewed the worktree code (A-C only) — review is in `ROUND3_REVIEW_FINDINGS.md`
8. **Fixes D-H from commit `163933c` were NEVER reviewed**
9. We cherry-picked `163933c` back onto this branch to recover the code
10. Created `ROUND3_5_INSTRUCTIONS.md` — instructions for the next review + code agent cycle

**The plan going forward:**
1. User pushes recovered code (from `163933c`) to the code branch `claude/fork-multi-branch-kR5aM`
2. New planning chat reviews the code branch (with `163933c` code added) against `ROUND3_5_INSTRUCTIONS.md`
3. Planning chat produces a Round 4 instruction doc based on review findings
4. Code agent is dispatched to the code branch with Round 4 instructions
5. Final review before merge

---

## Key Files

| File | Purpose |
|------|---------|
| `docs/MULTI_BRANCH_IMPLEMENTATION.md` | Full spec doc |
| `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` | Round 2 instruction doc (8 tasks) |
| `.claude/ROUND3_FIX_INSTRUCTIONS.md` | Round 3 fix instructions (Fixes A-H) |
| `.claude/ROUND3_5_INSTRUCTIONS.md` | **NEW** — Round 3.5 review checklist + known issues for next cycle |
| `.claude/REVIEW_FINDINGS_FORK.md` | Round 2 review results |
| `.claude/ROUND3_REVIEW_FINDINGS.md` | Round 3 review (A-C only — D-H never reviewed) |
| `.claude/REVIEW_FINDINGS.md` | ❌ STALE — reviewed wrong branch, ignore |

---

## What's Been Reviewed vs Not

### Fixes A-C: REVIEWED and PASSED (with non-blocking issues)

These were reviewed against the worktree code. The same code is in `163933c`. Known issues:
- **A:** No `db.transaction()` in `saveOrderLocally()`, naming differs from spec, `branchId` typed as optional
- **B:** COGS aggregation duplicated across routes (should be in orderService), no pagination
- **C:** Stock-check POST loop not wrapped in `db.transaction()`

### Fixes D-H: IMPLEMENTED in `163933c` but NEVER REVIEWED

These need the new planning chat to review:
- **D:** `update-stock` route — should use BranchStock + syncLegacy, remove WC
- **E:** `materialService` cleanup — remove `updateMaterialStock()`, redirect `getLowStockMaterials()`, init BranchStock for new materials
- **F:** `productService` cleanup — stop writing `stockQuantity`, init BranchStock for new products
- **G:** Stock-check PDF — should include branch name/address
- **H:** Admin layout branch indicator badge

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
