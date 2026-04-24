# coffee-oasis-online-api

Standalone Next.js API for Coffee Oasis online ordering. No POS UI, no SQLite — purely cloud routes backed by Supabase.

## What this is

This is the backend for the customer-facing online ordering app. It lives separately from the main POS repo (ren1) which runs locally on Windows with SQLite.

## Setup

1. Copy this entire folder into a new repo and push to `bubu1`
2. Create a new Vercel project pointed at that repo
3. Run `supabase/schema.sql` in your Supabase SQL editor
4. Add env vars to Vercel (see `.env.local.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FIUU_MERCHANT_ID`
   - `FIUU_VERIFY_KEY`
   - `FIUU_SECRET_KEY`
5. In Fiuu portal, register `/api/webhooks/fiuu` as your Notification URL
6. In Supabase: `ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;`

## Endpoints

| Method | Path | Caller | Purpose |
|--------|------|--------|---------|
| POST | `/api/orders` | Customer app | Create order after Fiuu payment |
| POST | `/api/webhooks/fiuu` | Fiuu IPN | Verify & store payment confirmation |
| GET | `/api/online/orders` | POS | Fetch active order queue |
| PATCH | `/api/online/orders/:id` | POS | Advance order status |
| GET | `/api/online/products` | Customer app | Fetch live menu |
| PATCH | `/api/online/products/:id/stock` | POS | Sync stock/availability |

## Order flow

1. Customer pays via Fiuu
2. Fiuu calls `POST /api/webhooks/fiuu` — payment ref stored in `fiuu_payments`
3. Customer app calls `POST /api/orders` with `payment_ref` — order created
4. Supabase Realtime broadcasts insert to POS
5. POS barista accepts → `PATCH /api/online/orders/:id` with `{ status: "accepted" }`
6. Barista marks ready → customer notified
7. Customer collects → `{ status: "collected" }`

## Status machine

```
pending → accepted → ready → collected
pending → rejected
accepted → rejected
```

## Next steps (for the bubu1 Claude Code session)

- Wire up customer notifications (WhatsApp via Twilio/360Dialog) on status → `ready`
- Build the POS online orders screen with Supabase Realtime subscription
- Integrate with the customer app frontend (designs already done)
