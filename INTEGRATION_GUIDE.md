# POS ↔ Customer App Integration Guide

This document describes how the POS backend (ren1) and customer-facing app (bubu1) communicate via the shared Supabase database. Both apps talk directly to Supabase — no API calls between them.

---

## Architecture Overview

```
Customer app (bubu1.vercel.app)              POS app (ren1 / this repo)
───────────────────────────────              ────────────────────────────
Customer browses menu from Supabase          Staff manage products in local SQLite
  → reads `products` + `product_recipe_items`  → auto-syncs to Supabase on every change
  → shows combos, selection groups, prices     → also syncs on POS startup
Customer places order & pays via Fiuu        Staff see orders on Kanban board
  → callback writes to Supabase                ← Supabase Realtime subscription
  → online_orders + online_order_items         Staff accept / reject / ready / collect
  → customer order page subscribes       ←──── Status changes written to Supabase
     via Supabase Realtime                     Customer sees change instantly
```

No API calls between the two apps. Both talk directly to the same Supabase project.

---

## 1. Product Catalog (Menu)

### Source of Truth

POS SQLite is the source of truth for all product data. Products auto-sync to Supabase in two ways:

1. **Auto-sync hooks** — Every product create/update/delete and every recipe change fires a fire-and-forget sync to Supabase
2. **Startup sync** — On POS boot, all products and recipes are pushed to Supabase to catch anything missed

Staff can also trigger a full sync manually from the admin dashboard.

### Supabase Tables

#### `products`
```sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,                    -- UUID from POS (e.g. "a1b2c3d4-...")
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uncategorized',
  base_price NUMERIC NOT NULL DEFAULT 0,  -- retail price in RM
  image_url TEXT,
  combo_price_override NUMERIC,           -- if set, overrides calculated combo price
  available_online BOOLEAN DEFAULT true,  -- staff can toggle off to hide from customer menu
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `product_recipe_items`
```sql
CREATE TABLE IF NOT EXISTS product_recipe_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'material',  -- 'material' or 'product'
  linked_product_id TEXT REFERENCES products(id),
  linked_product_name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'unit',
  is_optional BOOLEAN DEFAULT false,
  selection_group TEXT,                    -- XOR group name (e.g. "Choose Drink")
  price_adjustment NUMERIC DEFAULT 0,     -- e.g. +2.00 for iced upgrade
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_product ON product_recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_linked ON product_recipe_items(linked_product_id);
```

### How to Fetch the Menu

```typescript
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('available_online', true)
  .order('category', { ascending: true })
  .order('name', { ascending: true });
```

### Combos & Bundles

A product is a combo if it has `product_recipe_items` with `item_type = 'product'`.

```typescript
const { data: recipeItems } = await supabase
  .from('product_recipe_items')
  .select(`
    id, item_type, linked_product_id, linked_product_name,
    quantity, unit, is_optional, selection_group, price_adjustment, sort_order
  `)
  .eq('product_id', productId)
  .order('sort_order', { ascending: true });

const isCombo = recipeItems?.some(item => item.item_type === 'product');
```

### XOR Selection Groups

Items with the same `selection_group` value are mutually exclusive choices. The customer must pick exactly one from each group.

**Example for "Nasi Lemak Combo":**

| selection_group | linked_product_name | price_adjustment |
|---|---|---|
| Choose Drink | Flat White | 0 |
| Choose Drink | Americano | 0 |
| Choose Drink | Iced Latte | 2.00 |
| null | Nasi Lemak Bungkus | 0 |

- `selection_group = null` and `is_optional = false` → always included
- `is_optional = true` → optional add-on (customer can toggle on/off)

### Nested XOR (e.g. Hot/Iced for each drink)

If a linked product itself has recipe items with selection groups, fetch those too for nested selection:

```typescript
for (const item of recipeItems.filter(i => i.linked_product_id)) {
  const { data: nestedItems } = await supabase
    .from('product_recipe_items')
    .select('*')
    .eq('product_id', item.linked_product_id)
    .not('selection_group', 'is', null)
    .order('sort_order');
  // If nestedItems exist, show nested selection UI
}
```

### Price Calculation for Combos

```
finalPrice = (product.combo_price_override ?? product.base_price)
           + SUM(selected items' price_adjustment)
```

### Product Categories

Categories come directly from POS product data. Common values: `coffee`, `non-coffee`, `food`, `combo`, `uncategorized`. The customer app should group/filter by these.

### Product Images

`image_url` is synced from POS. May be null for products without images. The customer app should show a placeholder for missing images.

---

## 2. Online Ordering

### Order Lifecycle

Customer app creates orders; POS manages them through status transitions.

**Status flow:**
```
pending → accepted     Staff accepted, preparation starts
pending → rejected     Staff rejected (with optional reason)
accepted → ready       Order prepared, waiting for pickup
accepted → rejected    Staff rejected after initially accepting
ready → collected      Customer picked up the order
```

Terminal states: `collected`, `rejected` — no further transitions.

### Schema

#### `online_orders`
```sql
id                TEXT PRIMARY KEY          -- e.g. "A1006" (sequential, prefixed)
payment_ref       TEXT UNIQUE               -- Fiuu tranID
outlet_id         TEXT DEFAULT 'main'
status            TEXT                      -- pending/accepted/ready/collected/rejected
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
updated_at        TIMESTAMPTZ
```

#### `online_order_items`
```sql
id            UUID PRIMARY KEY
order_id      TEXT REFERENCES online_orders(id) ON DELETE CASCADE
product_id    TEXT                              -- UUID from `products` table
product_name  TEXT
qty           INTEGER
unit_price    NUMERIC
mods          JSONB
```

#### `outlet_settings`
```sql
outlet_id     TEXT PRIMARY KEY   -- 'main'
intake_paused BOOLEAN            -- when true, customer app blocks new orders
updated_at    TIMESTAMPTZ
```

### Creating Orders (Customer App)

When creating `online_order_items`, use the product's UUID from the `products` table as `product_id`:

```typescript
{
  product_id: product.id,      // UUID from products table (e.g. "a1b2c3d4-...")
  product_name: product.name,
  qty: quantity,
  unit_price: finalPrice,
  mods: {
    size: "Large",
    milk: "Oat",
    notes: "Extra hot please"
  }
}
```

For combos, include selected components so the kitchen knows what to make:

```typescript
{
  product_id: comboProduct.id,
  product_name: "Nasi Lemak Combo",
  qty: 1,
  unit_price: 9.40,
  mods: {
    combo_selections: {
      "Choose Drink": { id: "flat-white-uuid", name: "Flat White" },
      "Temperature": { id: "hot-uuid", name: "Hot" }
    },
    notes: "Extra sambal"
  }
}
```

### Mods Format

The POS displays item mods from `online_order_items.mods`. Expected JSONB format:

```json
{
  "size": "Large",
  "milk": "Oat",
  "sugar": "Less",
  "ice": "No ice",
  "notes": "Extra hot please"
}
```

- `notes` is shown separately (italicized)
- All other keys are joined with " · " for display (e.g., "Large · Oat · Less Sugar · No ice")
- Key names are flexible — POS iterates all keys except `notes` and `combo_selections`
- Values should be human-readable strings

### Order ID Format

The POS displays `online_orders.id` as the order number (e.g., "A1006"). IDs should be easy to call out verbally in the shop.

---

## 3. Realtime Subscriptions

### Customer App: Order Status Updates

Subscribe to status changes on a specific order:

```typescript
const channel = supabase
  .channel(`order-${orderId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'online_orders',
      filter: `id=eq.${orderId}`,
    },
    (payload) => {
      const updated = payload.new;
      // updated.status — 'pending' | 'accepted' | 'ready' | 'collected' | 'rejected'
      // updated.reject_reason — string | null
      // updated.accepted_at, ready_at, collected_at, rejected_at — timestamps
    }
  )
  .subscribe();
```

### Required Realtime Setup

These tables need Realtime enabled in Supabase:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE products;  -- optional, for live menu updates
```

---

## 4. Customer App Responsibilities

### Handle Rejected Orders

When `status` becomes `rejected`:
1. Show a clear "Order Rejected" state (not "pending" forever)
2. Display `reject_reason` if present (e.g., "Reason: Out of oat milk")
3. If `reject_reason` is null, show generic message (e.g., "Your order could not be fulfilled")
4. Show a "Contact store" option or phone number
5. Refund: currently manual — show "Please contact the store for refund arrangements"

### Check Intake Status Before Checkout

```typescript
const { data } = await supabase
  .from('outlet_settings')
  .select('intake_paused')
  .eq('outlet_id', 'main')
  .single();

if (data?.intake_paused) {
  // Block new orders, show "Online ordering is temporarily unavailable"
}
```

Optionally subscribe to Realtime on `outlet_settings` to unblock automatically when staff resumes.

### Use Real Product UUIDs

The customer app must read products from the `products` table (not mock/hardcoded data). Product UUIDs from this table must be used as `product_id` in `online_order_items` — this is what connects online orders to POS inventory for stock tracking and kitchen display.

### Handle Product Availability

- Products with `available_online = false` should be hidden or greyed out
- The `available_online` flag is managed by POS staff via the online orders admin panel

---

## 5. Migration Notes

### Legacy `online_products` Table (being phased out)

The POS previously used a separate `online_products` table with hardcoded mock product IDs (`flat`, `latte`, `danish`, etc.) for sold-out toggles and stock counts. This is being replaced by the `products` table which has real POS UUIDs and the `available_online` flag.

**Customer app should:**
- Read menu from `products` table (not `online_products`)
- Use `products.id` (UUID) as the product identifier everywhere
- Use `products.available_online` for availability (replaces `online_products.available`)
- Ignore `online_products` — it will be removed

### Stock Management (Future)

Currently, stock for online orders is tracked via `online_products.stock_count` and a `decrement_stock` RPC. This will migrate to use the POS's branch stock system. For now:
- `products` table doesn't have a `stock_count` column
- Sold-out state is managed via `available_online` toggle (staff manually marks items as sold out)
- Future: automatic sold-out when branch stock reaches 0

---

## 6. Summary Checklist for Customer App

### Must Have
- [ ] Read menu from `products` table (not mock data)
- [ ] Use product UUIDs from `products.id` in order items
- [ ] Handle all order statuses: pending, accepted, ready, collected, rejected
- [ ] Display `reject_reason` when order is rejected
- [ ] Check `outlet_settings.intake_paused` before allowing checkout
- [ ] Respect `available_online` flag — hide/grey out unavailable products
- [ ] Subscribe to `online_orders` Realtime for live order status updates

### Should Have
- [ ] Support combo/bundle products with XOR selection groups
- [ ] Handle nested selection groups (e.g., Hot/Iced for each drink option)
- [ ] Calculate combo prices using `combo_price_override` + `price_adjustment`
- [ ] Include `combo_selections` in mods for combo orders
- [ ] Show placeholder for products without `image_url`
- [ ] Subscribe to `outlet_settings` Realtime for auto-unblock when intake resumes

### Nice to Have
- [ ] Subscribe to `products` Realtime for live menu updates (new items, price changes)
- [ ] Cache product list locally, sync-check for updates on app open
- [ ] Show estimated wait time (can query recent orders)

---

## 7. Supabase Setup SQL

Run this in the Supabase SQL Editor if the tables don't exist yet:

```sql
-- Products table (synced from POS)
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'uncategorized',
  base_price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  combo_price_override NUMERIC,
  available_online BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Recipe items (combo structure)
CREATE TABLE IF NOT EXISTS product_recipe_items (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'material',
  linked_product_id TEXT REFERENCES products(id),
  linked_product_name TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'unit',
  is_optional BOOLEAN DEFAULT false,
  selection_group TEXT,
  price_adjustment NUMERIC DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_recipe_product ON product_recipe_items(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_linked ON product_recipe_items(linked_product_id);

-- Online orders
CREATE TABLE IF NOT EXISTS online_orders (
  id TEXT PRIMARY KEY,
  payment_ref TEXT UNIQUE,
  outlet_id TEXT DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'pending',
  pickup_type TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_fcm_token TEXT,
  total_paid NUMERIC,
  currency TEXT DEFAULT 'MYR',
  reject_reason TEXT,
  accepted_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Online order items
CREATE TABLE IF NOT EXISTS online_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  mods JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON online_order_items(order_id);

-- Outlet settings
CREATE TABLE IF NOT EXISTS outlet_settings (
  outlet_id TEXT PRIMARY KEY,
  intake_paused BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
```

After creating tables, trigger initial product sync from POS:
```bash
curl -X POST http://localhost:3000/api/admin/catalog-sync
```

Or use the "Catalog Sync" button on the POS admin dashboard.
