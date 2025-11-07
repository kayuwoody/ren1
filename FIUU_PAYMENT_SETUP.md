# Fiuu Payment Gateway Integration

This document explains how to set up and use the Fiuu payment gateway integration for Coffee Oasis POS.

## Overview

Fiuu (formerly MOLPay/RazerMS) is a Malaysian payment gateway that supports:
- FPX (Malaysian online banking)
- E-wallets (GrabPay, Touch 'n Go, Boost, ShopeePay)
- Credit/Debit cards (Visa, Mastercard)
- QR payments (DuitNow)
- Over-the-counter payments (7-Eleven, KK Mart)

## Prerequisites

1. **Fiuu Merchant Account**
   - Sign up at [Fiuu Merchant Portal](https://merchant.fiuu.com)
   - Get your credentials:
     - Merchant ID
     - Verify Key (vcode)
     - Secret Key (skey)

2. **Development Account**
   - Request a sandbox/developer account for testing
   - Sandbox URL: `https://sandbox.fiuu.com`
   - Production URL: `https://pay.fiuu.com`

## Environment Setup

Add the following to your `.env.local` file:

```bash
# Fiuu Payment Gateway
FIUU_MERCHANT_ID=your_merchant_id_here
FIUU_VERIFY_KEY=your_verify_key_here
FIUU_SECRET_KEY=your_secret_key_here
FIUU_SANDBOX_MODE=true  # Set to false for production

# Application URLs (for Fiuu callbacks)
NEXT_PUBLIC_APP_URL=https://yourdomain.com  # Or http://localhost:3000 for local dev
```

## Fiuu Portal Configuration

Register these callback URLs in your Fiuu merchant portal:

1. **Return URL** (browser redirect):
   ```
   https://yourdomain.com/api/payments/return
   ```

2. **Notification URL** (server webhook - MOST IMPORTANT):
   ```
   https://yourdomain.com/api/payments/notify
   ```

3. **Callback URL** (delayed updates):
   ```
   https://yourdomain.com/api/payments/callback
   ```

**Note:** For local development, you'll need to use a tunnel service like ngrok to expose your local server:
```bash
ngrok http 3000
# Then use the ngrok URL in Fiuu portal: https://xyz123.ngrok.io/api/payments/...
```

## Payment Flow

### 1. Initiate Payment

```typescript
// Example: Initiate payment from your checkout page
const response = await fetch('/api/payments/initiate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    orderID: '12345',
    amount: '25.50',
    currency: 'MYR',
    paymentMethod: 'credit', // or 'fpx', 'grabpay', etc.
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerPhone: '0123456789',
    description: 'Coffee Oasis Order #12345',
  }),
});

const { paymentURL } = await response.json();

// Redirect customer to Fiuu payment page
window.location.href = paymentURL;
```

### 2. Customer Pays

Customer is redirected to Fiuu's hosted payment page where they:
- Select payment method
- Enter payment details
- Complete authentication (FPX login, OTP, etc.)

### 3. Payment Callbacks

After payment, Fiuu sends notifications through **3 channels**:

#### A. Notification URL (Webhook) - Most Reliable ✅
- Server-to-server callback
- Sent immediately after payment
- **USE THIS for order status updates**
- Handler: `app/api/payments/notify/route.ts`

#### B. Return URL (Browser Redirect) - For UI Only
- Customer's browser is redirected here
- **DO NOT rely on this for critical logic** (user may close browser)
- Handler: `app/api/payments/return/route.ts`
- Redirects to:
  - Success: `/payment/success?order=12345&txn=ABC123`
  - Failed: `/payment/failed?order=12345&status=11`

#### C. Callback URL (Delayed) - For Non-Realtime Payments
- Sent for payments that complete after initial response
- E.g., bank transfers, QR codes with delayed confirmation
- Handler: `app/api/payments/callback/route.ts`

### 4. Order Status Update

The webhook handlers automatically update WooCommerce orders:

**Successful Payment (status = "00"):**
- Order status → `processing`
- Metadata added:
  - `_fiuu_transaction_id`
  - `_fiuu_payment_status`
  - `_fiuu_payment_date`
  - `_fiuu_payment_channel`
  - `_fiuu_payment_amount`

**Failed Payment (status = "11"):**
- Order status → `failed`
- Error metadata added if available

**Pending Payment (status = "22"):**
- Logged but not acted upon
- Will be updated when callback URL receives final status

## Payment Methods

### Available Payment Method Codes:

| Code | Payment Method | Description |
|------|---------------|-------------|
| `credit` | Credit/Debit Card | Visa, Mastercard, UnionPay |
| `fpx` | FPX | Malaysian online banking |
| `fpx_B2B1` | FPX B2B | Corporate banking |
| `grabpay` | GrabPay | E-wallet |
| `tng` | Touch 'n Go | E-wallet |
| `boost` | Boost | E-wallet |
| `shopeepay` | ShopeePay | E-wallet |
| `maybank_qrpay` | Maybank QR | QR payment |
| `duitnow` | DuitNow | QR/online transfer |
| `7eleven` | 7-Eleven | Over-the-counter |
| `kkmart` | KK Mart | Over-the-counter |

**To show all methods:** Use `credit` as payment method and let Fiuu display all available options on their page.

## Security

### Request Signing (vcode)
Outbound payment requests use MD5 hash:
```
vcode = MD5(amount + merchantID + orderID + verifyKey)
```

### Response Verification (skey)
Inbound callbacks use double-hashed MD5:
```
hash1 = MD5(tranID + orderID + status + domain + amount + currency + paydate + secretKey)
skey = MD5(hash1)
```

**IMPORTANT:** Always verify the `skey` in callbacks to prevent fraud!

## Testing

### Sandbox Testing

1. Set `FIUU_SANDBOX_MODE=true` in `.env.local`
2. Use sandbox credentials from Fiuu portal
3. Use test card numbers provided by Fiuu:
   - Success: `5123450000000008` (Mastercard)
   - Failed: `4111111111111111` (Visa declined)

### Test Flow

```bash
# 1. Start dev server
npm run dev

# 2. Create a test order in your POS

# 3. Initiate payment (via your checkout page or direct API call)
curl -X POST http://localhost:3000/api/payments/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderID": "999",
    "amount": "10.00",
    "paymentMethod": "credit"
  }'

# 4. Open the returned paymentURL in browser

# 5. Complete payment on Fiuu page

# 6. Check server logs for webhook notifications

# 7. Verify order status updated in WooCommerce
```

## Troubleshooting

### Issue: Webhook not received

**Causes:**
- Fiuu can't reach your callback URL (firewall, wrong URL)
- SSL certificate issues
- Server returned error instead of "OK"

**Solutions:**
- Check Fiuu portal logs for callback attempts
- Use ngrok for local testing
- Ensure HTTPS in production
- Check server logs for errors

### Issue: Invalid signature error

**Causes:**
- Wrong secret key in environment
- Order ID mismatch
- Tampered request

**Solutions:**
- Verify `FIUU_SECRET_KEY` matches portal
- Check server logs for signature comparison
- Ensure order ID is string (not number)

### Issue: Payment successful but order not updated

**Causes:**
- Webhook received but database update failed
- WooCommerce API error

**Solutions:**
- Check server logs for update errors
- Verify WooCommerce API credentials
- Use transaction requery API to check status:
  ```typescript
  const fiuu = getFiuuService();
  const status = await fiuu.requeryTransaction('orderID');
  ```

## Production Checklist

- [ ] Get production credentials from Fiuu
- [ ] Set `FIUU_SANDBOX_MODE=false`
- [ ] Update environment variables with production keys
- [ ] Register production callback URLs in Fiuu portal
- [ ] Ensure HTTPS is enabled on your domain
- [ ] Test end-to-end with real (small) payment
- [ ] Set up monitoring/logging for payment webhooks
- [ ] Document refund process for support team

## API Reference

### POST /api/payments/initiate

Generates payment URL for customer redirect.

**Request:**
```json
{
  "orderID": "12345",
  "amount": "25.50",
  "currency": "MYR",
  "paymentMethod": "credit",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "0123456789",
  "description": "Order #12345"
}
```

**Response:**
```json
{
  "success": true,
  "paymentURL": "https://sandbox.fiuu.com/RMS/pay/...",
  "orderID": "12345",
  "amount": "25.50",
  "currency": "MYR"
}
```

### POST /api/payments/notify

Webhook endpoint for payment notifications (called by Fiuu).

**Do not call this directly** - only Fiuu servers should POST here.

### GET/POST /api/payments/return

Return URL for browser redirects after payment.

Automatically redirects to:
- `/payment/success` - on successful payment
- `/payment/failed` - on failed payment
- `/payment/error` - on error

### POST /api/payments/callback

Callback endpoint for delayed payment updates (called by Fiuu).

**Do not call this directly** - only Fiuu servers should POST here.

## Support

- **Fiuu Documentation:** https://docs.fiuu.com
- **Merchant Portal:** https://merchant.fiuu.com
- **Fiuu Support:** support@fiuu.com

## Code Structure

```
lib/
  └── fiuuService.ts          # Fiuu API wrapper (signature generation/verification)

app/api/payments/
  ├── initiate/route.ts       # Payment initiation
  ├── notify/route.ts         # Webhook handler (notification URL)
  ├── return/route.ts         # Browser redirect handler (return URL)
  └── callback/route.ts       # Delayed payment handler (callback URL)

app/payment/
  ├── success/page.tsx        # Success page UI
  ├── failed/page.tsx         # Failure page UI
  └── error/page.tsx          # Error page UI
```

## Next Steps

After successful integration:
1. Implement refund functionality (optional)
2. Add payment analytics/reporting
3. Set up payment reconciliation
4. Monitor transaction success rates
5. Optimize payment method selection based on user behavior
