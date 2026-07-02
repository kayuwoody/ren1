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

# Intended Upgrades — Productization / Multi-tenant Groundwork

**Status:** Intent only. Not currently building. No plan to resell the POS at
this time, and no intent to operate outside the Malaysia (UTC+8) timezone.
**Guiding rule:** only build groundwork that ALSO improves the single-shop
product today. Anything that pays off solely in a resale scenario stays here as
documented intent until there is a concrete trigger (a second location, a
second real user, or genuine reseller interest).

## U1. Centralize the business profile (config source)

**Trigger:** second location, or reseller interest. **Dual-benefit:** yes (maintainability).

Today the app is hardcoded to *be* Coffee Oasis in many places. Pull these
behind a single config/settings source so they're changed in one place:
- **Timezone** — hardcoded UTC+8 offset math in `lib/dateUtils.ts`, daily stats,
  the online-intake schedule, and receipts. (Note: staying UTC+8 for the
  foreseeable future, so this is low priority — but the scattered offset math is
  a latent fragility even single-shop.)
- **Currency** — "RM" strings throughout.
- **Business hours** — 8am–8:30pm / closed Sunday baked into
  `app/api/online-orders/intake/route.ts`.
- **Branding** — mascot + business name/address in `lib/receiptGenerator.ts`.

## U2. Branch-scoping discipline (→ tenant seam)

**Trigger:** second location. **Dual-benefit:** yes (correct multi-branch).

The branch system (`X-Branch-Id`, `getBranchIdFromRequest`, `branchId` columns)
is already the natural seam a tenant model would sit on. Keep every query
branch-scoped and audit the few that aren't. This directly enables a real
second Coffee Oasis location (far likelier than resale) and keeps the
multi-tenant door open at no extra cost.

## U3. Auth + roles

**Trigger:** more than a handful of trusted staff, or any resale. **Dual-benefit:** partial.

Replace the shared sessionStorage PIN with real accounts and roles
(owner/manager/cashier/kitchen). Even single-shop, a who-did-what **audit trail**
on voids/discounts/price-overrides/shutdown has standalone value and could be
done as a lighter first step ahead of full role-based auth.

## U4. Data isolation model (decision, not code)

**Trigger:** any real multi-tenant use. **Cheap to decide now, expensive to retrofit.**

Decide shared-DB-with-`tenant_id`(+RLS) vs DB-per-tenant before building
anything multi-tenant. No code needed now; just keep treating branch as the
scoping key everywhere (see U2), which keeps both options open.

## U5. Payment-provider abstraction

**Trigger:** first real integrated payment path (see Alliance Bank ECR, below).

A thin interface so cash / DuitNow QR / Fiuu / bank terminal sit behind one
payment-result shape. Build this AROUND the first real integration, not before.

## U6. Alliance Bank ECR card terminal (parked — external blockers)

**Status:** Parked. Blocked on (1) Alliance Bank approving the application and
(2) signing an NDA to receive the ECR API spec. Terminal is confirmed
ECR-capable with APIs.

When unblocked, do the low-risk groundwork first (all free, single-shop useful):
- Explicit **tender types** (cash / DuitNow QR / card) on the order.
- A nullable **payment-reference / approval-code** field on the order (also the
  hook that later enables card refunds).
- **Payment-method breakdown** in the daily report + cash-up.

Then build the ECR adapter behind the U5 seam. Open questions for the spec:
transport (local serial/USB/LAN vs cloud API), approval-code + txn-id return,
refund/void + void-on-timeout, settlement/reconciliation report API,
tipping/partial approvals, sandbox availability.

---

# Operational Gaps (deferred — revisit when volume grows)

These are real single-shop gaps, consciously deferred because current sales
volume makes the manual workaround cheaper than the feature. Revisit when
volume increases.

## O1. Refunds / voids / returns
No flow exists to reverse a customer sale. A proper version would: set order
status (voided/refunded), restock materials (reverse `InventoryConsumption` +
BranchStock), reverse COGS, and write an audit entry. Today any correction is
manual. Deferred: low volume, wrong-order corrections are rare.

## O2. Cash management / end-of-day cash-up
No opening float, cash in/out, or Z-report to reconcile the drawer against
sales. The "profit today" card is the closest existing thing. Deferred: low
volume.

## O3. Order types / table management
Dine-in vs takeaway vs delivery, and table assignment for dine-in. Ripples into
kitchen display, receipts, reporting. Deferred: grab-and-go model, low volume.
(Owner-raised; kept for when the format expands.)

## O4. Rate limiting + PDPA exposure (shared with bubu1)
bubu1's API routes have no rate limiting; sequential-phone scraping of order
history is a PDPA exposure as the user base grows. Also verify whether the
public anon key can read Supabase tables directly (RLS off + default anon
grants) — test: `curl "$SUPABASE_URL/rest/v1/loyalty_members?select=phone,name"
-H "apikey: <anon-key>"`. If it returns rows, the customer list is directly
readable regardless of the phone-gated app routes. Deferred: low traffic; cheap
to add rate limiting (Vercel middleware / Upstash) when traffic grows.

---

## Notes

- Full audit context and the "keep / false-alarm" decisions live in
  `ROUND6_REVIEW_FINDINGS.md`.
- WooCommerce is fully removed; BranchStock is the sole source of truth for
  stock; both critical transaction wrappers are in place.
