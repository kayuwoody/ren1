# Project Context for Claude

## Multi-Branch Feature (in progress)

### Key Files
- `docs/MULTI_BRANCH_IMPLEMENTATION.md` — Full spec
- `.claude/ROUND3_FIX_INSTRUCTIONS.md` — Current round of fixes
- `.claude/REVIEW_FINDINGS_FORK.md` — Round 2 review results
- `.claude/session-state.md` — Detailed session state and planning history

### Architectural Decisions (locked)
1. **BranchStock** is the sole source of truth for stock. Legacy columns are computed aggregates only.
2. **WooCommerce** is being deprecated. Remove WC sync calls; don't add new ones.
3. **branchId** is required in service functions. Fallback to default branch at API layer only.
4. Use `better-sqlite3` sync API. Wrap multi-step stock ops in `db.transaction()`.
