# coffee-oasis-online-api

Standalone Next.js API for Coffee Oasis online ordering. No POS UI, no SQLite — purely cloud routes backed by Supabase.

## What this is

This is the backend for the customer-facing online ordering app. It lives separately from the main POS repo (ren1) which runs locally on Windows with SQLite.

## Setup

1. Create a new Vercel project pointed at this repo
2. Run `supabase/schema.sql` in your Supabase SQL editor
3. Add env vars to Vercel (see `.env.local.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FIUU_MERCHANT_ID`
   - `FIUU_VERIFY_KEY`
   - `FIUU_SECRET_KEY`
4. In Fiuu portal, register `/api/webhooks/fiuu` as your Notification URL
5. In Supabase dashboard, enable Realtime on the `online_orders` table:
   `ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;`

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
5. POS barista accepts → `PATCH /api/online/orders/:id` with `status: accepted`
6. Barista marks ready → customer gets notified
7. Customer collects → `status: collected`

## Status machine

```
pending → accepted → ready → collected
pending → rejected
accepted → rejected
```

## For the next Claude Code session (bubu1 repo)

This code should be copied into the `bubu1` GitHub repo and deployed as a new Vercel project. The POS repo (`ren1`) does NOT need these files — it runs locally and connects to Supabase only for realtime order subscriptions (future work).

Next steps:
- Wire up customer notifications (WhatsApp via Twilio/360Dialog) when status → `ready`
- Build the POS online orders screen that subscribes to Supabase Realtime
- Integrate with the customer app frontend (designs already done)
