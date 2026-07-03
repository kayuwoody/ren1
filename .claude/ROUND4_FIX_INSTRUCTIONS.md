# Round 4 — Final Fix Instructions

**Purpose:** Self-contained instructions for a code agent to complete all remaining multi-branch work.

**Branch:** Originally `claude/fork-multi-branch-kR5aM`

**Status:** ✅ ALL PHASES COMPLETED — Verified by Round 6 audit (June 2026)

**Architecture rules (locked):**
1. BranchStock = sole source of truth for stock quantities
2. WooCommerce is fully removed — `lib/wooClient.ts` deleted, zero functional references remain
3. No direct writes to `Material.stockQuantity` or `Product.stockQuantity` except in `syncLegacyStockColumns()`
4. `branchId` is required (not optional) in service functions
5. Use `db.transaction()` for multi-step stock operations

---

## Completion Status

| Fix | Phase | Status | Verified |
|-----|-------|--------|----------|
| 0A: branchStockService additions (`initBranchStockForItem`, `getBranchStockRecord`) | 0 | ✅ Done | June 2026 |
| 0B: orderService at proper path (`lib/db/orderService.ts`) | 0 | ✅ Done | June 2026 |
| D: update-stock route — BranchStock, no WC | 1 | ✅ Done | June 2026 |
| E1: Delete `updateMaterialStock()` | 2 | ✅ Done | June 2026 |
| E2: `getLowStockMaterials()` branch-aware | 2 | ✅ Done | June 2026 |
| E3: Init BranchStock for new materials | 2 | ✅ Done | June 2026 |
| E4: Stop `stockQuantity` write in UPDATE | 2 | ✅ Done | June 2026 |
| F1: Stop `stockQuantity` write in UPDATE | 3 | ✅ Done | June 2026 |
| F2: Hardcode 0 in INSERT | 3 | ✅ Done | June 2026 |
| F3: Init BranchStock for new products | 3 | ✅ Done | June 2026 |
| F4: Fix WC sync stock logic | 3 | ✅ Neutralized | June 2026 — caller still passes value but receiver ignores it |
| G1: Branch header in PDF | 4 | ✅ Done | June 2026 |
| G2: Read BranchStock in PDF | 4 | ✅ Done | June 2026 |
| G3: Accept request param | 4 | ✅ Done | June 2026 |
| H: Admin layout branch indicator | 5 | ✅ Done | June 2026 |
| A1/C1: Transaction wrappers | 6 | ✅ Done | June 2026 — both `saveOrderLocally` and stock-check POST |
| 7A: Cleanup root-level files | 7 | ✅ Done | June 2026 |

---

## Remaining Cleanup (Low Priority)

These are dead code / cosmetic issues found in the June 2026 audit. None affect correctness or runtime behavior.

See `ROUND6_REVIEW_FINDINGS.md` for details.
