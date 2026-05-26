# Restock Notification Edge Function

Sends email (and eventually WhatsApp) to customers who signed up for restock alerts.

## Prerequisites

1. **Resend account** — sign up at https://resend.com
2. **Verified domain** — add `coffee-oasis.com.my` in Resend dashboard (DNS records)
3. **Supabase CLI** — `npm install -g supabase`

## Database Setup

Run in Supabase SQL Editor:

```sql
-- Notification subscriptions (may already exist from bubu1)
create table if not exists stock_notifications (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null,
  product_name text not null,
  phone        text null,
  email        text null,
  created_at   timestamptz not null default now(),
  notified_at  timestamptz null,
  constraint at_least_one_contact check (phone is not null or email is not null)
);

create index if not exists idx_stock_notif_product on stock_notifications (product_id);
create index if not exists idx_stock_notif_pending on stock_notifications (notified_at) where notified_at is null;
```

## Deploy

```bash
# Login to Supabase
supabase login

# Link to your project (run from repo root)
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set RESEND_API_KEY=re_xxxxx
supabase secrets set FROM_EMAIL="Coffee Oasis <noreply@coffee-oasis.com.my>"

# Deploy the function
supabase functions deploy notify-restock
```

## Schedule (Daily Cron)

Option A — Supabase Dashboard:
1. Go to Edge Functions → notify-restock → Schedule
2. Set cron: `0 9 * * *` (9 AM daily UTC — 5 PM MYT)

Option B — pg_cron (run in SQL Editor):
```sql
select cron.schedule(
  'notify-restock-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-restock',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Test

```bash
# Invoke manually
supabase functions invoke notify-restock

# Or via curl
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-restock \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

## WhatsApp (Future)

Replace the `sendWhatsApp` stub in `index.ts` with your provider's API call.
Add the API key as a secret: `supabase secrets set WHATSAPP_API_KEY=xxx`
