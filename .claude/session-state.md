# Session State: Code Review & Round 4 Planning

## READ THIS FIRST — EVERY TIME

- **You are the ARCHITECT.** This session reviews implementation code and produces instruction docs.
- **Code branch:** `claude/fork-multi-branch-kR5aM`
- **Your push branch:** `claude/review-session-state-vR06M`
- **On every session resume:** Read this file first, summarize status, ask user to confirm.

---

**Last updated:** 2026-03-11

## Resume Here

**Status:** Round 4 instructions COMPLETE. `ROUND4_FIX_INSTRUCTIONS.md` written and ready for code agent.

**What happened this session:**
1. Checked out code branch `claude/fork-multi-branch-kR5aM`
2. Discovered root-level files (`api/`, `db/`) are uploaded at WRONG paths — a mix of fixed and unfixed code
3. Proper-path files (`app/api/`, `lib/db/`) are the real project; some have Round 2-3 fixes, others need D-H fixes
4. Reviewed all D-H fixes against spec using root-level files as reference
5. Verified A-C known issues — all still present
6. Ran cross-cutting checks — no architectural violations in already-fixed files
7. Wrote `ROUND4_FIX_INSTRUCTIONS.md` with complete, self-contained instructions

**Key finding:** `lib/db/branchStockService.ts` at proper path is MISSING `initBranchStockForItem()` — must be added before Fixes E3/F3 can work. Also `lib/db/orderService.ts` doesn't exist at proper path.

**Review Results Summary:**

| Fix | Verdict | Issue |
|-----|---------|-------|
| D | Root PASS | Needs copy to `app/api/products/update-stock/route.ts` |
| E | Root PARTIAL | E4: UPDATE still writes stockQuantity to Material table |
| F | Root PASS | Minor: stale WC comment on line 201 |
| G | Root PARTIAL | Still reads legacy columns for stock (not BranchStock) |
| H | Root PASS | Needs creation at `app/admin/layout.tsx` |
| A1 | STILL PRESENT | saveOrderLocally not in transaction |
| A3 | STILL PRESENT | branchId optional in LocalOrder |
| C1 | STILL PRESENT | stock-check POST loop not in transaction |

**The plan going forward:**
1. User/agent dispatches a code agent with `ROUND4_FIX_INSTRUCTIONS.md`
2. Code agent executes Phases 0-8 on this branch
3. Final review after code agent completes
4. Merge to main

---

## Key Files

| File | Purpose |
|------|---------|
| `.claude/ROUND4_FIX_INSTRUCTIONS.md` | **CURRENT** — Round 4 instructions for code agent |
| `.claude/ROUND3_5_INSTRUCTIONS.md` | Review checklist (completed this session) |
| `.claude/ROUND3_REVIEW_FINDINGS.md` | Round 3 review (A-C pass, D-H not done in worktree) |
| `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` | Original Round 2 instructions |
| `api/`, `db/`, `layout.tsx`, `branchContext.tsx` | Root-level uploads — reference only, to be deleted in Phase 7 |

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
