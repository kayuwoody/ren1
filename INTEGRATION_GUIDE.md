# POS ↔ Customer App Integration Guide

This document describes how the POS backend (ren1) and customer-facing app (bubu1) communicate via the shared Supabase database. Both apps talk directly to Supabase — no API calls between them.

---

## What the POS Does (for the customer app to handle)

### Order Status Updates

The POS writes status changes directly to `online_orders` via Supabase. The customer app should subscribe via Realtime to reflect these instantly.

**Status flow:**
```
pending → accepted     Staff accepted the order, preparation starts
pending → rejected     Staff rejected the order (with optional reason)
accepted → ready       Order is prepared, waiting for pickup
accepted → rejected    Staff rejected after initially accepting
ready → collected      Customer picked up the order
```

**Terminal states:** `collected`, `rejected` — no further changes.

**Fields updated per transition:**

| New Status | Fields Written |
|---|---|
| `accepted` | `status`, `accepted_at` |
| `rejected` | `status`, `rejected_at`, `reject_reason` (nullable TEXT) |
| `ready` | `status`, `ready_at` |
| `collected` | `status`, `collected_at` |

### Rejected Orders — Customer App Must Handle

When staff reject an order, the POS sets:
```sql
status = 'rejected'
rejected_at = NOW()
reject_reason = 'Out of oat milk'  -- or NULL if no reason given
```

**Customer app should:**
1. Subscribe to `UPDATE` events on `online_orders` filtered by the order ID
2. When `status` becomes `rejected`:
   - Show a clear "Order Rejected" state (not just "pending" forever)
   - Display `reject_reason` if present (e.g., "Reason: Out of oat milk")
   - If `reject_reason` is null, show generic message (e.g., "Your order could not be fulfilled")
   - Consider showing a "Contact store" option or phone number
   - **Refund handling:** Rejected orders were already paid via Fiuu. Refund policy/process is manual for now — the customer app should display a note like "Please contact the store for refund arrangements" or similar

### Realtime Subscription Pattern (Customer Order Page)

```typescript
// On the customer's /order/[id] page:
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
      // updated.reject_reason — string | null (only meaningful when rejected)
      // updated.accepted_at, ready_at, collected_at, rejected_at — timestamps
    }
  )
  .subscribe();
```

### Intake Paused

The POS can pause online ordering by setting:
```sql
UPDATE outlet_settings SET intake_paused = true WHERE outlet_id = 'main'
```

**Customer app should:**
1. Check `outlet_settings.intake_paused` before allowing checkout
2. If `true`, block new orders and show "Online ordering is temporarily unavailable"
3. Optionally subscribe to Realtime on `outlet_settings` to unblock automatically when staff resumes

### Stock Decrements on Accept

When POS accepts an order, it calls:
```sql
SELECT decrement_stock(p_product_id, 'main', qty)
```

This decrements `online_products.stock_count`. If stock reaches 0, the product should show as sold out in the customer app menu.

**Customer app should:**
- Read `online_products.stock_count` and `available` when rendering the menu
- Products with `stock_count = 0` should show "Sold Out"
- Products with `available = false` should be hidden or greyed out
- `stock_count = NULL` means unlimited stock

---

## What the POS Needs From the Customer App

### 1. Confirm `decrement_stock` RPC Exists

The POS calls this Supabase RPC function when accepting orders:
```typescript
await supabase.rpc('decrement_stock', {
  p_product_id: item.product_id,
  p_outlet_id: 'main',
  p_qty: item.qty,
});
```

**Expected function signature:**
```sql
CREATE OR REPLACE FUNCTION decrement_stock(
  p_product_id TEXT,
  p_outlet_id TEXT,
  p_qty INTEGER
) RETURNS void AS $$
BEGIN
  UPDATE online_products
  SET stock_count = GREATEST(stock_count - p_qty, 0)
  WHERE id = p_product_id AND outlet_id = p_outlet_id AND stock_count IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
```

If this doesn't exist yet, it needs to be created in Supabase.

### 2. Confirm Realtime Is Enabled

The POS subscribes to Realtime on `online_orders`. This requires:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;
```

If not already done, the POS Realtime subscription will silently fail (falls back to 15s polling, so it still works — just not instant).

### 3. Confirm Schema Match

The POS reads and writes these exact column names. If the customer app schema differs, one side needs to adapt:

**`online_orders`** — POS reads: `id`, `status`, `pickup_type`, `outlet_id`, `customer_name`, `customer_phone`, `total_paid`, `currency`, `reject_reason`, `accepted_at`, `ready_at`, `created_at`, `updated_at`. POS writes: `status`, `accepted_at`, `ready_at`, `collected_at`, `rejected_at`, `reject_reason`.

**`online_order_items`** — POS reads: `id`, `product_name`, `qty`, `unit_price`, `mods` (JSONB).

**`outlet_settings`** — POS reads/writes: `outlet_id`, `intake_paused`.

### 4. Mods Format

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

The `notes` field is shown separately (italicized). All other keys are joined with " · " for display (e.g., "Large · Oat · Less Sugar · No ice").

Key names are flexible — the POS just iterates all keys except `notes`. But values should be human-readable strings.

### 5. Order ID Format

The POS displays `online_orders.id` directly as the order number (e.g., "A1006"). The customer app should generate these IDs in a format that's easy to call out verbally in the shop.

---

## Future Considerations

### Push Notifications
`online_orders.customer_fcm_token` exists but isn't used yet. When ready:
- Customer app stores FCM token on the order row after checkout
- POS could trigger a push notification on status change (would need a Cloud Function or edge function, since POS can't call FCM directly from the browser)

### Refund Flow
Currently manual. A future implementation could:
- Add a `refund_status` column to `online_orders`
- POS triggers refund via Fiuu API when rejecting
- Customer app shows refund status

---

## Summary of Customer App TODO

1. **Handle `rejected` status** on the order page — show reason if available, refund contact info
2. **Check `outlet_settings.intake_paused`** before checkout — block if paused
3. **Respect `stock_count`** in menu — show sold out when 0
4. **Confirm/create `decrement_stock`** RPC function in Supabase
5. **Confirm Realtime** is enabled on `online_orders` table
