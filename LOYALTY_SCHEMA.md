# Loyalty & Voucher System Schema

Run this SQL in the Supabase SQL Editor to create the loyalty and voucher tables.

## Create Tables

```sql
-- Loyalty members
CREATE TABLE IF NOT EXISTS loyalty_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  points_balance INTEGER NOT NULL DEFAULT 0,
  total_points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_phone ON loyalty_members(phone);

-- Loyalty point transactions (audit log)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES loyalty_members(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'earn' | 'redeem' | 'adjust'
  points INTEGER NOT NULL,           -- positive for earn, negative for redeem
  source TEXT NOT NULL,              -- 'scan' | 'purchase' | 'voucher_issued' | 'manual'
  reference_id TEXT,                 -- order ID, voucher ID, etc.
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_member ON loyalty_transactions(member_id);

-- Loyalty program config (single row)
CREATE TABLE IF NOT EXISTS loyalty_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  points_per_scan INTEGER NOT NULL DEFAULT 1,
  points_threshold INTEGER NOT NULL DEFAULT 10,
  voucher_type TEXT NOT NULL DEFAULT 'fixed',       -- 'fixed' | 'percent'
  voucher_discount_value NUMERIC NOT NULL DEFAULT 5, -- RM amount or percentage
  voucher_validity_days INTEGER NOT NULL DEFAULT 30,
  voucher_min_order NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default config
INSERT INTO loyalty_config (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- Vouchers
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  member_id UUID REFERENCES loyalty_members(id),  -- null for general/promo vouchers
  type TEXT NOT NULL DEFAULT 'fixed',              -- 'fixed' | 'percent'
  discount_value NUMERIC NOT NULL,                 -- RM amount or percentage
  min_order_amount NUMERIC NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  times_used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'manual',           -- 'loyalty' | 'manual' | 'promo'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_voucher_member ON vouchers(member_id);
```
