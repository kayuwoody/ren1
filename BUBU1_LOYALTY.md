# Bubu1 Loyalty & Pass System — Frontend Integration Guide

POS-side loyalty is fully built. Bubu1 (customer-facing app) needs to surface it. All data lives in the shared Supabase database.

## What Exists in Supabase

### Tables (see LOYALTY_SCHEMA.md for full DDL)

- `loyalty_members` — one row per customer, keyed by `phone`
- `loyalty_programs` — program definitions (scan stamps, purchase rewards, passes)
- `loyalty_member_programs` — per-member per-program balances and pass enrollments
- `loyalty_transactions` — audit log of all point earn/redeem/expire events
- `vouchers` — auto-generated from loyalty milestones or manually created
- `loyalty_program_products` — join table linking pass programs to eligible product IDs
- `member_pass_usage` — per-use audit log for passes (order_id, product_id, used_at)

### Key Relationships

```
loyalty_members (phone) 
  └── loyalty_member_programs (member_id → program_id)
        ├── loyalty_programs (trigger_type: scan | purchase | pass)
        └── member_pass_usage (enrollment_id)
  └── vouchers (member_id)
  └── loyalty_transactions (member_id, program_id)
```

## Customer QR Code

Each customer's QR code encodes their **phone number** (Malaysian format, e.g. `+60123456789` or `0123456789`). The POS scans this to identify the customer. Bubu1 should generate and display this QR prominently in the app.

## Member Lookup

```typescript
const { data: member } = await supabase
  .from('loyalty_members')
  .select('*')
  .eq('phone', userPhone)
  .single();
```

If no member exists, the customer hasn't been scanned at POS yet. Show an "unregistered" state with their QR code and a prompt to visit the shop.

## Stamp / Points Programs

### Fetch balances

```typescript
const { data: balances } = await supabase
  .from('loyalty_member_programs')
  .select('*, loyalty_programs(name, description, trigger_type, threshold, voucher_type, voucher_discount_value)')
  .eq('member_id', member.id)
  .in('loyalty_programs.trigger_type', ['scan', 'purchase']);
```

Display as stamp cards or progress bars. Key fields:
- `points_balance` — current stamps/points toward next reward
- `total_earned` — lifetime total
- `loyalty_programs.threshold` — stamps needed for a voucher
- `loyalty_programs.voucher_discount_value` — what they get at threshold

### Transaction history

```typescript
const { data: transactions } = await supabase
  .from('loyalty_transactions')
  .select('*, loyalty_programs(name)')
  .eq('member_id', member.id)
  .order('created_at', { ascending: false })
  .limit(50);
```

Each row has `type` (earn/redeem/expire), `points` (+/-), `description`, `created_at`.

## Vouchers

```typescript
const { data: vouchers } = await supabase
  .from('vouchers')
  .select('*')
  .eq('member_id', member.id)
  .eq('is_active', true)
  .order('created_at', { ascending: false });
```

Show as redeemable cards. Key fields:
- `code` — the voucher code (displayed as QR for scanning at POS)
- `type` — `fixed` or `percent`
- `discount_value` — RM amount or percentage
- `min_order_amount` — minimum order to use
- `times_used` / `max_uses` — usage tracking
- `expires_at` — null means no expiry

Filter client-side: hide where `times_used >= max_uses` or `expires_at < now()`.

The customer shows their voucher QR at the POS. The POS scans the code and applies the discount.

## Passes

Passes are stored as `loyalty_member_programs` rows where the linked program has `trigger_type = 'pass'`.

### Fetch active passes

```typescript
const { data: passes } = await supabase
  .from('loyalty_member_programs')
  .select('*, loyalty_programs(name, description, pass_type)')
  .eq('member_id', member.id)
  .eq('loyalty_programs.trigger_type', 'pass');
```

Key fields:
- `code` — `PASS-XXXXXXXX` format, displayed as QR for scanning at POS
- `points_balance` — uses remaining
- `total_earned` — total uses ever loaded
- `is_active` — false when fully used
- `expires_at` — null for use-based passes, date for time-based
- `loyalty_programs.pass_type` — `use_based` or `time_based`

### Fetch eligible products for a pass

```typescript
const { data: eligible } = await supabase
  .from('loyalty_program_products')
  .select('product_id')
  .eq('program_id', pass.program_id);

// Then look up product names
const { data: products } = await supabase
  .from('products')
  .select('id, name, base_price, image_url')
  .in('id', eligible.map(e => e.product_id));
```

### Fetch pass usage history

```typescript
const { data: usage } = await supabase
  .from('member_pass_usage')
  .select('*')
  .eq('enrollment_id', passEnrollmentId)
  .order('used_at', { ascending: false });
```

Each row: `product_id`, `order_id`, `used_at`. Resolve product names from the `products` table.

### Pass redemption flow

Customer shows their pass QR code (`PASS-XXXXXXXX`) at POS. The POS validates it, checks eligible products in the cart, and deducts uses on payment.

## Realtime (Optional)

Subscribe to balance changes so the app updates live after a POS scan:

```typescript
supabase
  .channel('loyalty')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'loyalty_member_programs',
    filter: `member_id=eq.${member.id}`,
  }, (payload) => {
    // Refresh balances
  })
  .subscribe();
```

Also subscribe to `vouchers` for new voucher notifications.

## Suggested UI Pages

1. **Home / Dashboard** — QR code (phone number), current stamp progress, active pass summary
2. **Stamps** — Per-program stamp cards with progress, recent transaction list
3. **Vouchers** — List of available/used/expired vouchers, each showing QR code
4. **Passes** — Active passes with uses remaining, eligible products, usage history
5. **History** — Combined transaction log across all programs

## RLS Notes

Bubu1 uses the anon key. You'll need Supabase RLS policies so customers can only read their own data:

```sql
-- Example: members can read their own record
ALTER TABLE loyalty_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own" ON loyalty_members
  FOR SELECT USING (phone = current_setting('request.jwt.claims')::json->>'phone');

-- Similar policies needed for:
-- loyalty_member_programs, loyalty_transactions, vouchers, member_pass_usage
```

The exact RLS approach depends on how bubu1 authenticates users (Supabase Auth, custom JWT, etc.). If using Supabase Auth with phone auth, the JWT `sub` or a custom claim can carry the phone number.

Alternatively, if bubu1 uses a service role for API routes (server-side), RLS isn't needed — filter by phone/member_id in your queries.
