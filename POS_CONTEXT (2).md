# Coffee Oasis POS — Build Context

You are building the **staff-facing POS** for Coffee Oasis, a coffee shop at Taman Segar Perdana, 43200 Cheras. This is a **Next.js app** used in-person by baristas on a tablet or desktop. It shares a Supabase database with the customer-facing ordering app.

---

## System Overview

```
Customer app (bubu1.vercel.app)          POS app (this repo)
─────────────────────────────────        ───────────────────────
Customer browses menu & pays             Staff see & action orders
  → Fiuu payment gateway
  → callback writes to Supabase    ←──── Supabase Realtime (shared DB)
  → online_orders row created            Staff accept / reject / ready
  → customer order page subscribes  ←── Staff update status in Supabase
     via Supabase Realtime               Customer sees change instantly
```

No API calls between the two apps. Both talk directly to the same Supabase project.

---

## Environment Variables (POS)

```
SUPABASE_URL=               # same project as customer app
SUPABASE_SERVICE_ROLE_KEY=  # use service role — bypasses RLS
```

---

## Database Schema (relevant tables)

### `online_orders`
```sql
id                TEXT PRIMARY KEY          -- e.g. "A1006" (sequential, prefixed A)
payment_ref       TEXT UNIQUE               -- Fiuu tranID, e.g. "147533"
outlet_id         TEXT DEFAULT 'main'
status            TEXT                      -- see transitions below
pickup_type       TEXT                      -- 'counter' | 'curbside'
customer_name     TEXT
customer_phone    TEXT
customer_fcm_token TEXT                     -- for push notifications (future)
total_paid        NUMERIC
currency          TEXT DEFAULT 'MYR'
reject_reason     TEXT
accepted_at       TIMESTAMPTZ
ready_at          TIMESTAMPTZ
collected_at      TIMESTAMPTZ
rejected_at       TIMESTAMPTZ
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ               -- auto-updated by trigger
```

**Status transitions (enforced in POS logic):**
```
pending → accepted | rejected
accepted → ready   | rejected
ready    → collected
```
Terminal states: `collected`, `rejected` — no further transitions.

### `online_order_items`
```sql
id            UUID PRIMARY KEY
order_id      TEXT REFERENCES online_orders(id) ON DELETE CASCADE
product_id    TEXT
product_name  TEXT
qty           INTEGER
unit_price    NUMERIC
mods          JSONB   -- e.g. {"size":"Large","milk":"Oat","sugar":"Less","ice":"No ice","notes":""}
```

### `outlet_settings`
```sql
outlet_id     TEXT PRIMARY KEY   -- 'main'
intake_paused BOOLEAN            -- when true, customer app blocks new orders + shows banner
updated_at    TIMESTAMPTZ
```

### `online_products`
```sql
id          TEXT PRIMARY KEY   -- must match product IDs below
outlet_id   TEXT
name        TEXT
category    TEXT
price       NUMERIC
available   BOOLEAN            -- false = hidden/greyed in customer menu
stock_count INTEGER            -- null = unlimited; 0 triggers auto sold-out via DB trigger
image_url   TEXT
updated_at  TIMESTAMPTZ
```

### `fiuu_payments` (read-only for POS)
```sql
payment_ref  TEXT PRIMARY KEY   -- Fiuu tranID
order_id     TEXT               -- links to online_orders.id after callback
amount       NUMERIC
currency     TEXT
status_code  TEXT               -- '00' = success
raw_payload  JSONB
created_at   TIMESTAMPTZ
```

---

## Product IDs (customer menu → online_products)

The customer menu is static. For `decrement_stock` and sold-out flags to work, `online_products` rows must use these exact IDs:

| ID | Name | Price |
|---|---|---|
| `flat` | Flat White | 10.50 |
| `latte` | Oasis Latte | 11.00 |
| `kopi` | Kopi-O Gula Melaka | 8.50 |
| `danish` | Butter Danish | 6.50 |
| `esp` | Espresso | 7.00 |
| `ame` | Americano | 8.50 |
| `cap` | Cappuccino | 10.50 |
| `moch` | Mocha | 12.00 |
| `matcha` | Matcha Latte | 12.50 |
| `choc` | Hot Chocolate | 11.00 |
| `chai` | Spiced Chai | 10.00 |
| `icel` | Iced Latte | 11.00 |
| `frap` | Coffee Frappe | 13.50 |
| `cold` | Cold Brew | 12.00 |
| `crois` | Almond Croissant | 7.50 |
| `muf` | Blueberry Muffin | 6.00 |
| `kayab` | Kaya Butter Toast | 5.50 |
| `c1` | Kopi + Toast (combo) | 13.00 |
| `c2` | Latte + Danish (combo) | 15.00 |

If a product ID has no row in `online_products`, the customer app treats it as available (default open). Only add rows when you need to mark something sold-out or track stock.

---

## Confirmed Integration Points

All items from the integration guide have been verified/implemented on the customer app side:

| Item | Status |
|---|---|
| `decrement_stock(p_product_id, p_outlet_id, p_qty)` RPC | ✅ exists in schema |
| Realtime enabled on `online_orders` | ✅ `ALTER PUBLICATION supabase_realtime ADD TABLE online_orders` in schema |
| Schema column names match | ✅ confirmed |
| Mods JSONB format `{size, milk, sugar, ice, notes}` | ✅ confirmed, values are human-readable strings |
| Order ID format | ✅ `A` + sequential number (e.g. `A1006`) |
| Rejected order handling | ✅ customer order page shows `reject_reason` + refund note |
| Intake paused banner | ✅ customer menu shows yellow banner + blocks checkout when `intake_paused = true` |
| Sold-out items in menu | ✅ `available=false` or `stock_count=0` → "Sold out" badge, add button disabled |

---

## Supabase Client Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    global: {
      // Prevent Next.js data cache from serving stale reads
      fetch: (input, init) =>
        fetch(input as RequestInfo, { ...init as RequestInit, cache: 'no-store' }),
    },
  }
);
```

---

## Core POS Operations

### Fetch active orders (initial load + polling fallback)
```typescript
const { data } = await supabase
  .from('online_orders')
  .select(`
    id, status, pickup_type, outlet_id,
    customer_name, customer_phone,
    total_paid, currency, reject_reason,
    accepted_at, ready_at, created_at, updated_at,
    online_order_items ( id, product_id, product_name, qty, unit_price, mods )
  `)
  .eq('outlet_id', 'main')
  .in('status', ['pending', 'accepted', 'ready'])
  .order('created_at', { ascending: true });
```

### Subscribe to new orders via Realtime
```typescript
const channel = supabase
  .channel('pos-orders')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'online_orders', filter: 'outlet_id=eq.main' },
    payload => { /* add new order to state, play alert sound */ }
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'online_orders', filter: 'outlet_id=eq.main' },
    payload => { /* update order in state */ }
  )
  .subscribe();
```

### Update order status
```typescript
const now = new Date().toISOString();
const updates: Record<string, unknown> = { status: newStatus };
if (newStatus === 'accepted')  updates.accepted_at  = now;
if (newStatus === 'ready')     updates.ready_at      = now;
if (newStatus === 'collected') updates.collected_at  = now;
if (newStatus === 'rejected')  { updates.rejected_at = now; updates.reject_reason = reason ?? null; }

await supabase
  .from('online_orders')
  .update(updates)
  .eq('id', orderId);
```

When accepting an order, also decrement stock for each item:
```typescript
for (const item of orderItems) {
  await supabase.rpc('decrement_stock', {
    p_product_id: item.product_id,
    p_outlet_id:  'main',
    p_qty:        item.qty,
  });
}
```

### Mark item sold out / toggle availability
```typescript
// Sold out (keeps row, hides add button in customer menu)
await supabase
  .from('online_products')
  .upsert({ id: productId, outlet_id: 'main', available: false }, { onConflict: 'id' });

// Back in stock
await supabase
  .from('online_products')
  .upsert({ id: productId, outlet_id: 'main', available: true, stock_count: null }, { onConflict: 'id' });
```

The customer menu polls `/api/availability` on load — changes are visible on next page load or refresh. Realtime on `online_products` is not yet subscribed on the customer side, so sold-out changes are not instant in the menu (order page status changes are instant).

### Pause / resume intake
```typescript
await supabase
  .from('outlet_settings')
  .upsert({ outlet_id: 'main', intake_paused: true }, { onConflict: 'outlet_id' });
```
Customer app: blocks new checkouts at the API level (returns 503) and shows a yellow banner on the menu page.

### Get average wait time (optional, for display)
```typescript
const { data: recent } = await supabase
  .from('online_orders')
  .select('created_at, ready_at')
  .eq('outlet_id', 'main')
  .eq('status', 'collected')
  .not('ready_at', 'is', null)
  .order('created_at', { ascending: false })
  .limit(20);

const avgSeconds = recent?.length
  ? Math.round(
      recent.reduce((sum, o) =>
        sum + (new Date(o.ready_at!).getTime() - new Date(o.created_at).getTime()) / 1000, 0
      ) / recent.length
    )
  : 0;
```

---

## UI Requirements

### Layout — Kanban board (3 columns)
| New Orders (`pending`) | In Progress (`accepted`) | Ready (`ready`) |
|---|---|---|
| Accept / Reject buttons | Mark Ready button | Collected button |
| Ordered oldest → newest | Oldest → newest | Oldest → newest |

### Each order card must show
- Order ID (e.g. **A1006**), time since order placed
- Customer name, pickup type (counter / curbside 🚗)
- Every item: `×2 Iced Latte` with mods on the next line (`Oat · Less Sugar · No Ice`)
- `notes` field shown separately if present (e.g. italicised below the mod line)
- Total paid
- Action button(s) appropriate for current status

### Reject flow
- Inline: show a text input for optional reject reason before confirming
- On confirm: update status to `rejected` with the reason
- Customer sees the reason immediately via Realtime on their order page

### Header
- Outlet name + "N new" badge when `pending` count > 0
- Average wait time (if available)
- Pause / Resume intake toggle — when paused show a warning banner

### Audio alert
- Play a short beep/tone when a new `pending` order arrives that wasn't in the previous fetch

### No authentication needed
- This app runs in-person on a staff device; URL access control is sufficient

---

## Brand / Design Tokens

```
Background:  #FFF6E8
Primary:     #F58220  (Coffee Oasis orange)
Ink:         #3A2414  (dark brown)
Success:     #2E7D32
Blue:        #1565C0
Danger:      #C62828
Neutral:     #546E7A

Fonts: 'Baloo 2' (headings/order IDs, weight 700-800), 'Nunito' (body)
Border radius: 16-22px on cards
```

---

## What the Customer App Already Does (don't duplicate)

- Hosts the menu, checkout, and Fiuu payment flow
- Receives the Fiuu callback and creates `online_orders` + `online_order_items` rows
- Customer's `/order/[id]` page subscribes to `online_orders` via Realtime — status label and icon update instantly when POS writes a status change
- Shows `reject_reason` on the order page when status is `rejected`, with a refund contact note
- Checks `outlet_settings.intake_paused` on checkout — returns 503 + shows banner if paused
- Polls `/api/availability` on menu load to show sold-out state for unavailable products

The POS only needs to **read** and **update** `online_orders` and `online_products`. It does not handle payments or order creation.
