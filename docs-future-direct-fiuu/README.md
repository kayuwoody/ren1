# Direct Fiuu Integration (Future Use)

⚠️ **This code is for FUTURE use when migrating away from WooCommerce.**

## Current Setup

The POS currently uses **WooCommerce's Fiuu plugin** for payments. This folder contains a complete direct Fiuu integration that will be used when you're ready to remove the WooCommerce dependency.

## What's in this folder

- **`lib/fiuuService.ts`** - Direct Fiuu API wrapper
  - Payment URL generation
  - Signature verification (MD5 double-hash)
  - Transaction requery
  - Refund API

- **`app/api/payments/`** - Payment API routes
  - `initiate/` - Generate Fiuu payment URL
  - `notify/` - Webhook for payment confirmation (most important)
  - `return/` - Browser redirect after payment
  - `callback/` - Delayed payment updates

- **`app/payment/`** - Payment result pages
  - `success/` - Payment successful page
  - `failed/` - Payment failed page
  - `error/` - Payment error page

- **`FIUU_PAYMENT_SETUP.md`** - Complete integration guide

## When to use this

Use this direct integration when:
1. You're ready to remove WooCommerce dependency
2. POS is deployed to a public URL (webhooks need to reach it)
3. You want full control over payment flow
4. You've migrated product/order management away from WooCommerce

## Migration Steps

1. **Deploy POS to public URL**
   - e.g., `https://pos.coffee-oasis.com.my`

2. **Move files back to main project:**
   ```bash
   mv _future-direct-fiuu/lib/fiuuService.ts lib/
   mv _future-direct-fiuu/app/api/payments app/api/
   mv _future-direct-fiuu/app/payment app/
   ```

3. **Add Fiuu credentials to .env.local:**
   ```bash
   FIUU_MERCHANT_ID=your_merchant_id
   FIUU_VERIFY_KEY=your_verify_key
   FIUU_SECRET_KEY=your_secret_key
   FIUU_SANDBOX_MODE=true
   NEXT_PUBLIC_APP_URL=https://pos.coffee-oasis.com.my
   ```

4. **Register webhook URLs in Fiuu portal:**
   - Notification: `https://pos.coffee-oasis.com.my/api/payments/notify`
   - Return: `https://pos.coffee-oasis.com.my/api/payments/return`
   - Callback: `https://pos.coffee-oasis.com.my/api/payments/callback`

5. **Update checkout flow** to use direct Fiuu:
   ```typescript
   // Old (WooCommerce):
   const order = await createWooOrder({ ... });
   showPaymentQR(order.payment_url); // WooCommerce checkout

   // New (Direct Fiuu):
   const order = await createWooOrder({ ... });
   const { paymentURL } = await fetch('/api/payments/initiate', {
     method: 'POST',
     body: JSON.stringify({
       orderID: order.id,
       amount: order.total,
     }),
   }).then(r => r.json());
   showPaymentQR(paymentURL); // Fiuu direct
   ```

6. **Test thoroughly** with sandbox before going live

## Why wait?

The WooCommerce approach is:
- ✅ Simpler (leverages existing setup)
- ✅ POS can run locally (no deployment needed)
- ✅ Proven reliable (battle-tested WooCommerce plugin)

The direct Fiuu approach is:
- ✅ Full control over payment flow
- ✅ No WooCommerce dependency
- ✅ Faster (one less system in the chain)
- ❌ Requires POS to be publicly accessible
- ❌ More code to maintain

## Questions?

See `FIUU_PAYMENT_SETUP.md` in this folder for complete documentation on the direct Fiuu integration.
