# Coffee Oasis — Data Flow Map

A comprehensive trace of how data moves through the system. Use this to understand interdependencies, identify redundancy, and plan improvements.

## System Boundaries

```
LOCAL (SQLite)                    CLOUD (Supabase)                 CLIENT (Browser)
──────────────────               ──────────────────               ──────────────────
Order, OrderItem                 pos_orders, pos_order_items      localStorage (cart)
Product, ProductRecipe           products, product_recipe_items   sessionStorage (auth)
Material, BranchStock            online_orders, online_order_items
StockMovement                    loyalty_members
InventoryConsumption             loyalty_programs
Branch                           loyalty_member_programs
                                 loyalty_transactions
                                 loyalty_program_products
                                 member_pass_usage
                                 vouchers
                                 outlet_settings
                                 Supabase Storage (receipts/)
```

---

## Flow 1: POS Order Creation

The most complex flow. Touches both databases, 5+ fire-and-forget side effects.

```
POS UI (admin/pos) → Product page → Payment page
       │
       ▼
POST /api/orders/create-with-payment
       │
       ├─ [BLOCKING] SQLite: INSERT Order + OrderItems (transaction)
       │    └─ Order number from COUNT(*) on Order table
       │
       ├─ [NON-BLOCKING] SQLite: recordProductSale() per item
       │    └─ Recursive recipe walk (max depth 5)
       │    └─ INSERT InventoryConsumption per material
       │    └─ UPDATE BranchStock (deduct materials)
       │    └─ INSERT StockMovement per deduction
       │
       ├─ [NON-BLOCKING] Supabase: Auto-create pass if purchased product matches pass_product_id
       │    └─ upsertMember() → loyalty_members
       │    └─ createOrTopUpPass() → loyalty_member_programs
       │
       ├─ [NON-BLOCKING] Supabase: syncPosOrder()
       │    └─ UPSERT pos_orders + pos_order_items
       │
       └─ Returns order JSON to client
              │
              ▼
       Payment confirmation (CashPayment / BankQR)
              │
              ├─ PATCH /api/orders/{id} → SQLite: update status, set kitchen timer
              │    └─ broadcastOrderUpdate() → SSE to kitchen displays
              │
              ├─ [NON-BLOCKING] POST /api/receipts/generate
              │    └─ SQLite: read order → generate HTML
              │    └─ Supabase Storage: upload to receipts/order-{id}.html
              │
              ├─ [NON-BLOCKING] POST /api/loyalty/purchase-points
              │    └─ Supabase: award points → loyalty_member_programs
              │    └─ Supabase: log → loyalty_transactions
              │    └─ Supabase: issue vouchers if threshold crossed → vouchers
              │
              ├─ [NON-BLOCKING] POST /api/vouchers/use
              │    └─ Supabase: increment times_used on vouchers
              │
              ├─ [NON-BLOCKING] POST /api/passes/use
              │    └─ Supabase: deduct points_balance on loyalty_member_programs
              │    └─ Supabase: INSERT member_pass_usage per product
              │
              └─ clearCart() → localStorage + POST /api/cart/current
                   └─ broadcastCartUpdate() → SSE to customer display
```

**Failure behavior:** Only the SQLite INSERT is blocking. All Supabase operations and inventory recording are fire-and-forget — the order succeeds even if they fail.

---

## Flow 2: Online Order Lifecycle

Customer app writes to Supabase. POS reads via Realtime + polling, manages status.

```
Customer App (bubu1)
  └─ INSERT online_orders + online_order_items (after Fiuu payment)
       │
       ▼
POS: /admin/online-orders (Kanban board)
  ├─ Supabase Realtime: channel 'pos-orders' on INSERT/UPDATE
  ├─ Fallback: GET /api/online-orders every 15s
  │
  ├─ ACCEPT (pending → accepted)
  │    ├─ Supabase: UPDATE online_orders (status, accepted_at)
  │    ├─ Supabase RPC: decrement_stock() per item
  │    └─ SQLite: recordProductSale() per item (with double-accept guard)
  │         └─ Same recursive consumption as POS orders
  │
  ├─ REJECT (pending/accepted → rejected)
  │    └─ Supabase: UPDATE online_orders (status, reject_reason)
  │    └─ No inventory changes (if rejected from accepted, consumption already recorded)
  │
  ├─ READY (accepted → ready)
  │    └─ Supabase: UPDATE online_orders (status, ready_at)
  │
  └─ COLLECTED (ready → collected)
       └─ Supabase: UPDATE online_orders (status, collected_at)
```

**Kitchen integration:** `/api/kitchen/orders` merges SQLite POS orders + Supabase online orders into one feed.

---

## Flow 3: QR Scan Routing

All scans detected by `useScanDetector` hook → routed by `LoyaltyScanListener`.

```
Barcode scanner input (keyboard events)
       │
       ▼
useScanDetector (buffer chars, trigger on Enter, min 4 chars)
       │
       ├─ Phone format? (/^(\+?60|0)\d{8,11}$/)
       │    └─ POST /api/loyalty/scan { phone }
       │         ├─ Supabase: upsertMember() → loyalty_members
       │         ├─ Supabase: check today's transactions (dedup per program per day)
       │         ├─ Supabase: awardPoints() → loyalty_member_programs
       │         │    └─ Issue vouchers if threshold crossed → vouchers
       │         ├─ Supabase: log → loyalty_transactions
       │         └─ Client: setCustomer() in cart context
       │
       ├─ Starts with "PASS-"?
       │    └─ POST /api/passes/validate { code, product_ids }
       │         ├─ Supabase: lookup loyalty_member_programs by code
       │         ├─ Supabase: check daily limit via member_pass_usage
       │         ├─ Supabase: lookup eligible products via loyalty_program_products
       │         ├─ Client: setPass() in cart context
       │         ├─ Client: setCustomer() if member linked
       │         └─ Client: fire-and-forget POST /api/loyalty/scan (triggers check-in)
       │
       └─ Other alphanumeric code?
            └─ POST /api/vouchers/validate { code, order_total }
                 ├─ Supabase: lookup vouchers by code
                 ├─ Validate: active, not expired, not maxed out, min order met
                 ├─ Client: setVoucher() in cart context
                 ├─ Client: setCustomer() if member linked
                 └─ Client: fire-and-forget POST /api/loyalty/scan (triggers check-in)
```

**Key insight:** All three scan types trigger a check-in stamp for the member. Phone does it directly; pass/voucher do it as a fire-and-forget side effect.

---

## Flow 4: Catalog Sync (SQLite → Supabase)

POS SQLite is source of truth. Supabase mirrors it for the customer app.

```
Admin edits product/recipe in POS
       │
       ├─ Product create/update: upsertProduct()
       │    └─ SQLite: INSERT/UPDATE Product table
       │    └─ [FIRE-AND-FORGET] syncProduct(id) → Supabase products table
       │
       ├─ Product delete: deleteProduct()
       │    └─ SQLite: DELETE Product
       │    └─ [FIRE-AND-FORGET] syncProductDelete(id) → Supabase
       │
       ├─ Recipe add/delete: addRecipeItem() / deleteRecipeItem()
       │    └─ SQLite: INSERT/DELETE ProductRecipe
       │    └─ [FIRE-AND-FORGET] syncRecipe(productId)
       │         └─ DELETE all product_recipe_items for product in Supabase
       │         └─ INSERT new rows
       │         └─ Rebuild selection_config (flattened XOR groups) on product
       │
       ├─ Recipe update: updateRecipeItem()
       │    └─ SQLite: UPDATE ProductRecipe
       │    └─ ⚠️ NO SYNC TRIGGERED (bug — recipe changes don't reach Supabase)
       │
       └─ Stock update: updateBranchStock()
            └─ SQLite: UPDATE BranchStock
            └─ [FIRE-AND-FORGET] syncProductStock(id) → Supabase products.stock_quantity

Startup recovery:
  └─ init.ts: syncAllProducts() + syncAllRecipes() + syncAllBranches()
  └─ Catches errors, logs warning, continues

Manual recovery:
  └─ POST /api/admin/catalog-sync → full re-sync
```

**No queue table exists.** Failed syncs are lost. Recovery relies on startup full-sync or manual trigger.

**Known bug:** `updateRecipeItem()` doesn't call `syncRecipe()`, so recipe edits (quantity changes, sort order) don't reach Supabase until next restart or manual sync.

---

## Flow 5: Cart → Customer Display (SSE)

```
Cart change in POS
       │
       ├─ localStorage: save cart, customer, voucher, pass
       ├─ CustomEvent: 'cart-updated' (cross-tab sync)
       └─ POST /api/cart/current { cart, voucher, pass }
            └─ In-memory state update (NOT persisted to DB)
            └─ broadcastCartUpdate() via cartStreamManager
                 └─ SSE push to all connected /api/cart/stream clients
                      │
                      ▼
              Customer Display (/customer-display)
                 └─ EventSource('/api/cart/stream')
                 └─ onmessage → update cart items, voucher, pass display
                 └─ Auto-reconnect every 3s if disconnected
```

**In-memory only:** Cart server state lives in Node process memory. Works for single-instance; would need Redis for multi-instance.

---

## Flow 6: Kitchen Display (SSE + Supabase Realtime)

```
Order status changes
       │
       ├─ POS order: PATCH /api/orders/{id}
       │    └─ SQLite: UPDATE Order
       │    └─ broadcastOrderUpdate() via orderStreamManager
       │         └─ SSE push to /api/kitchen/stream clients
       │
       └─ Online order: Supabase Realtime on online_orders table
            └─ Kitchen page subscribes via supabaseBrowser client

Kitchen Display (/kitchen)
  ├─ GET /api/kitchen/orders (initial load)
  │    └─ SQLite: SELECT orders WHERE status='processing' AND kitchenReady=0
  │    └─ Supabase: SELECT online_orders WHERE status='accepted'
  │    └─ Merge + sort by created_at
  │
  ├─ SSE: /api/kitchen/stream → triggers re-fetch on 'orders-updated'
  └─ Supabase Realtime → triggers re-fetch on INSERT/UPDATE
```

---

## Flow 7: Receipt Generation

```
POST /api/receipts/generate { orderId }
  └─ SQLite: getOrderWithItems(orderId)
  └─ Check mascot image in Supabase Storage
  └─ generateReceiptHTML(order, branch, mascotUrl)
       └─ Returns HTML string
  └─ uploadReceiptHTML(orderId, html)
       └─ Buffer.from(html, 'utf-8') ← required for correct MIME type
       └─ Supabase Storage: upload to receipts/order-{id}.html
  └─ Returns public URL
```

**URL pattern:** `{SUPABASE_URL}/storage/v1/object/public/receipts/order-{id}.html`

---

## Shared Functions & Cross-Cutting Concerns

### loyaltyService.ts (used by multiple flows)

| Function | Called By | Supabase Tables |
|----------|-----------|-----------------|
| `upsertMember(phone, name)` | scan, order creation | loyalty_members |
| `awardPoints(member, program, points)` | scan, purchase-points | loyalty_member_programs, loyalty_transactions, vouchers |
| `issueVoucher(member, program)` | awardPoints (when threshold crossed) | vouchers |
| `createOrTopUpPass(member, program, uses)` | order creation | loyalty_member_programs |

### inventoryConsumptionService.ts (used by POS + online orders)

| Function | Called By | SQLite Tables |
|----------|-----------|---------------|
| `recordProductSale(...)` | create-with-payment, online order accept | InventoryConsumption, BranchStock, StockMovement |
| `calculateProductCOGS(...)` | create-with-payment (pre-calc), /api/products/{id}/cogs | Read-only (no writes) |
| `getOrderConsumptions(orderId)` | online order accept (double-accept guard), sales reports | InventoryConsumption |

### dateUtils.ts

| Function | Called By |
|----------|-----------|
| `todayRangeKL()` | loyalty/scan (dedup), passes/validate (daily limit), passes/use (daily limit) |

---

## Database Write Matrix

Which flows write to which tables:

| Table | POS Order | Online Order | Phone Scan | Pass Scan | Voucher Scan | Catalog Edit |
|-------|-----------|-------------|------------|-----------|-------------|-------------|
| **SQLite** | | | | | | |
| Order | INSERT | — | — | — | — | — |
| OrderItem | INSERT | — | — | — | — | — |
| InventoryConsumption | INSERT | INSERT (accept) | — | — | — | — |
| BranchStock | UPDATE | UPDATE (accept) | — | — | — | UPDATE |
| StockMovement | INSERT | INSERT (accept) | — | — | — | INSERT |
| Product | — | — | — | — | — | INSERT/UPDATE/DELETE |
| ProductRecipe | — | — | — | — | — | INSERT/UPDATE/DELETE |
| **Supabase** | | | | | | |
| pos_orders | UPSERT | — | — | — | — | — |
| pos_order_items | UPSERT | — | — | — | — | — |
| online_orders | — | UPDATE | — | — | — | — |
| loyalty_members | UPSERT | — | UPSERT | — | — | — |
| loyalty_member_programs | UPSERT | — | UPSERT | — | — | — |
| loyalty_transactions | INSERT | — | INSERT | — | — | — |
| vouchers | INSERT | — | INSERT | — | UPDATE | — |
| member_pass_usage | INSERT | — | — | — | — | — |
| products | — | — | — | — | — | UPSERT/DELETE |
| product_recipe_items | — | — | — | — | — | DELETE+INSERT |
| receipts (Storage) | UPLOAD | — | — | — | — | — |

---

## Fire-and-Forget Inventory

Every non-blocking operation and what happens if it fails:

| Operation | Failure Impact | Recovery |
|-----------|---------------|----------|
| Inventory consumption recording | COGS not tracked for that order | `POST /api/debug/recreate-consumptions` backfill |
| POS order Supabase sync | Order not visible in customer app history | Restart triggers no auto-recovery; manual re-order needed |
| Receipt upload | No receipt link for customer | Re-trigger via `/api/receipts/generate` |
| Loyalty points award | Customer doesn't get points for purchase | Manual adjustment in Supabase |
| Voucher use tracking | Voucher can be reused | Manual update in Supabase |
| Pass use tracking | Pass uses not deducted | Manual update in Supabase |
| Pass auto-creation | Customer buys pass product but pass not created | Manual creation via admin loyalty page |
| Catalog sync to Supabase | Customer app shows stale menu | `POST /api/admin/catalog-sync` or restart |
| Check-in stamp (from pass/voucher scan) | Customer misses stamp | Scan phone QR separately |

---

## Known Issues & Improvement Candidates

1. **Recipe update sync bug:** `updateRecipeItem()` doesn't call `syncRecipe()`. Recipe quantity/sort changes don't reach Supabase until restart or manual sync.

2. **No sync queue:** Failed catalog syncs are silently lost. A `_sync_queue` table with retry logic would make offline operation more reliable.

3. **In-memory cart state:** Cart sync endpoint stores state in Node process memory. Server restart loses customer display state. Redis or SQLite-backed storage would be more durable.

4. **No POS order re-sync:** If `syncPosOrder()` fails, there's no recovery path. A startup job could scan recent SQLite orders and re-sync missing ones.

5. **Voucher/pass redemption not transactional:** If payment succeeds but voucher/pass deduction fails, the discount was applied but usage not tracked. Could be made atomic by moving deductions server-side into the order creation route.

6. **Order number from COUNT(*):** Not safe under concurrent requests. Could produce duplicate order numbers if two orders are created simultaneously.

7. **Double-consumption guard only on online orders:** The `getOrderConsumptions()` check exists for online order accept but not for POS order creation. If `create-with-payment` is called twice with the same orderId (unlikely but possible), consumption records would duplicate.

8. **Receipt URL is dynamic, not stored:** Receipt URLs are constructed from `SUPABASE_URL + orderId` at render time, not stored on the order. If the Supabase project changes, all old receipt links break.
