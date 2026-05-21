# POS Orders Supabase Schema

POS orders sync from local SQLite to Supabase so the customer app (bubu1) can show in-person purchase history.

## Create Tables

```sql
CREATE TABLE IF NOT EXISTS pos_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  customer_name TEXT,
  customer_phone TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  total_profit NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  branch_id TEXT,
  loyalty_member_id UUID REFERENCES loyalty_members(id),
  loyalty_member_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_phone ON pos_orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_pos_orders_member_phone ON pos_orders(loyalty_member_phone);
CREATE INDEX IF NOT EXISTS idx_pos_orders_member_id ON pos_orders(loyalty_member_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created ON pos_orders(created_at);

CREATE TABLE IF NOT EXISTS pos_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  qty INTEGER NOT NULL DEFAULT 1,
  base_price NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_applied NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pos_items_order ON pos_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_pos_items_product ON pos_order_items(product_id);
```

## How It Works

- POS creates the order in local SQLite first (source of truth for the store)
- After creation, it fire-and-forgets a sync to Supabase `pos_orders` + `pos_order_items`
- Uses upsert so re-syncing is safe (idempotent)
- If internet is down, the sync silently fails — the order still exists locally
- Only orders with a customer scan have `loyalty_member_phone` populated

## Customer Lookup

Orders with a loyalty scan have `loyalty_member_phone` set. Walk-in orders without a scan have `customer_phone = null` and `loyalty_member_phone = null`.

```sql
-- Find all POS orders for a customer by phone
SELECT * FROM pos_orders
WHERE loyalty_member_phone = '+60123456789'
ORDER BY created_at DESC;

-- With items
SELECT po.*, poi.*
FROM pos_orders po
LEFT JOIN pos_order_items poi ON poi.order_id = po.id
WHERE po.loyalty_member_phone = '+60123456789'
ORDER BY po.created_at DESC;
```
