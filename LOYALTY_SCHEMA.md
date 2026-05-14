# Loyalty & Voucher System Schema (Multi-Program)

Run this SQL in the Supabase SQL Editor to create the loyalty and voucher tables.

## Create Tables

```sql
-- Loyalty programs (one row per counter type)
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN ('scan', 'purchase', 'manual')),
  points_per_trigger INTEGER NOT NULL DEFAULT 1,
  points_per_rm NUMERIC,
  threshold INTEGER NOT NULL,
  voucher_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (voucher_type IN ('fixed', 'percent')),
  voucher_discount_value NUMERIC NOT NULL,
  voucher_validity_days INTEGER NOT NULL DEFAULT 90,
  voucher_min_order NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loyalty members (one row per customer, keyed by phone)
CREATE TABLE IF NOT EXISTS loyalty_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_phone ON loyalty_members(phone);

-- Per-member per-program balances
CREATE TABLE IF NOT EXISTS loyalty_member_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES loyalty_members(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES loyalty_programs(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_lmp_member ON loyalty_member_programs(member_id);
CREATE INDEX IF NOT EXISTS idx_lmp_program ON loyalty_member_programs(program_id);

-- Loyalty point transactions (audit log)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES loyalty_members(id) ON DELETE CASCADE,
  program_id UUID REFERENCES loyalty_programs(id),
  type TEXT NOT NULL,             -- 'earn' | 'redeem' | 'expire' | 'manual'
  points INTEGER NOT NULL,        -- positive = earn, negative = redeem/expire
  description TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lt_member ON loyalty_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_lt_program ON loyalty_transactions(program_id);

-- Vouchers (auto-generated from loyalty or manually created)
CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  member_id UUID REFERENCES loyalty_members(id),
  type TEXT NOT NULL DEFAULT 'fixed',
  discount_value NUMERIC NOT NULL,
  min_order_amount NUMERIC NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  times_used INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'manual',    -- 'loyalty' | 'manual' | 'promo'
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vouchers_member ON vouchers(member_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
```

## Increment Voucher Usage RPC

```sql
CREATE OR REPLACE FUNCTION increment_voucher_usage(voucher_code TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE vouchers SET times_used = times_used + 1 WHERE code = voucher_code;
END;
$$;
```

## Seed Example Programs

```sql
-- Visit stamp program: 10 scans = RM5 voucher
INSERT INTO loyalty_programs
  (name, description, trigger_type, points_per_trigger, threshold,
   voucher_type, voucher_discount_value, voucher_validity_days, sort_order)
VALUES
  ('Visit Stamps', 'Earn 1 stamp per visit. 10 stamps = RM5 off.',
   'scan', 1, 10, 'fixed', 5.00, 90, 1);

-- Purchase program: 1 point per order = RM5 voucher at 10 orders
INSERT INTO loyalty_programs
  (name, description, trigger_type, points_per_trigger, threshold,
   voucher_type, voucher_discount_value, voucher_validity_days, sort_order)
VALUES
  ('Purchase Rewards', 'Earn 1 point per order. 10 orders = RM5 off.',
   'purchase', 1, 10, 'fixed', 5.00, 90, 2);
```

## Enable Realtime (optional)

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE loyalty_member_programs;
ALTER PUBLICATION supabase_realtime ADD TABLE vouchers;
```
