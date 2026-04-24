-- ============================================================
-- Coffee Oasis — Online Ordering Schema
-- Run this in your Supabase SQL editor (once)
-- ============================================================

-- Sequence for human-readable order numbers (A1000, A1001, …)
CREATE SEQUENCE IF NOT EXISTS online_order_seq START 1000 INCREMENT 1;

CREATE OR REPLACE FUNCTION next_online_order_number()
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT nextval('online_order_seq');
$$;

-- ── Verified Fiuu payment refs ───────────────────────────────
-- Inserted by the webhook handler BEFORE the order is created.
-- order_id is backfilled once POST /api/orders creates the order.
CREATE TABLE IF NOT EXISTS fiuu_payments (
  payment_ref  TEXT        PRIMARY KEY,   -- Fiuu tranID
  order_id     TEXT,                      -- linked online_orders.id (nullable until order created)
  amount       NUMERIC     NOT NULL,
  currency     TEXT        NOT NULL DEFAULT 'MYR',
  status_code  TEXT        NOT NULL,      -- raw Fiuu status (e.g. "00")
  raw_payload  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Online orders ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS online_orders (
  id                TEXT        PRIMARY KEY,               -- e.g. "A1042"
  payment_ref       TEXT        NOT NULL UNIQUE REFERENCES fiuu_payments(payment_ref),
  outlet_id         TEXT        NOT NULL DEFAULT 'main',
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','ready','collected','rejected')),
  pickup_type       TEXT        NOT NULL DEFAULT 'counter'
                    CHECK (pickup_type IN ('counter','curbside')),
  customer_name     TEXT        NOT NULL,
  customer_phone    TEXT        NOT NULL,
  customer_fcm_token TEXT,
  total_paid        NUMERIC     NOT NULL,
  currency          TEXT        NOT NULL DEFAULT 'MYR',
  reject_reason     TEXT,
  accepted_at       TIMESTAMPTZ,
  ready_at          TIMESTAMPTZ,
  collected_at      TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_online_orders_outlet_status
  ON online_orders (outlet_id, status);

CREATE INDEX IF NOT EXISTS idx_online_orders_created_at
  ON online_orders (created_at DESC);

-- ── Online order items ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS online_order_items (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     TEXT    NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  product_id   TEXT    NOT NULL,
  product_name TEXT    NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  unit_price   NUMERIC NOT NULL,
  mods         JSONB   NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_online_order_items_order
  ON online_order_items (order_id);

-- ── Online product catalogue ─────────────────────────────────
-- Populated / synced from POS via PATCH /api/online/products/:id/stock
-- and the POS product-sync push.
CREATE TABLE IF NOT EXISTS online_products (
  id           TEXT        PRIMARY KEY,
  outlet_id    TEXT        NOT NULL DEFAULT 'main',
  name         TEXT        NOT NULL,
  category     TEXT        NOT NULL DEFAULT 'uncategorized',
  price        NUMERIC     NOT NULL,
  available    BOOLEAN     NOT NULL DEFAULT TRUE,
  stock_count  INTEGER,               -- NULL = unlimited (drinks); integer for pastries
  image_url    TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_online_products_outlet
  ON online_products (outlet_id, available);

-- ── Outlet settings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outlet_settings (
  outlet_id      TEXT    PRIMARY KEY,
  intake_paused  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default outlet
INSERT INTO outlet_settings (outlet_id, intake_paused)
VALUES ('main', false)
ON CONFLICT (outlet_id) DO NOTHING;

-- ── updated_at trigger ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_online_orders_updated_at
  BEFORE UPDATE ON online_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_online_products_updated_at
  BEFORE UPDATE ON online_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_outlet_settings_updated_at
  BEFORE UPDATE ON outlet_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Auto-mark product unavailable when stock reaches 0 ───────
CREATE OR REPLACE FUNCTION auto_sold_out()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_count IS NOT NULL AND NEW.stock_count <= 0 THEN
    NEW.available = FALSE;
    NEW.stock_count = 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_auto_sold_out
  BEFORE UPDATE ON online_products
  FOR EACH ROW EXECUTE FUNCTION auto_sold_out();

-- ── Decrement stock (called on order accept) ─────────────────
-- Only decrements when stock_count is non-null (i.e. tracked items).
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id TEXT,
  p_outlet_id  TEXT,
  p_qty        INTEGER
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE online_products
  SET stock_count = GREATEST(stock_count - p_qty, 0)
  WHERE id = p_product_id
    AND outlet_id = p_outlet_id
    AND stock_count IS NOT NULL;
END;
$$;

-- ── Enable Realtime on orders table ──────────────────────────
-- Run this manually in the Supabase dashboard → Database → Replication,
-- or execute:
--   ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;
-- The POS subscribes to INSERT/UPDATE events filtered by outlet_id.
