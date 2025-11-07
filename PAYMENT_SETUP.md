# Payment Setup - WooCommerce + Fiuu Integration

## Overview

The POS uses **WooCommerce's existing Fiuu payment gateway plugin** for payment processing. This approach:

- ✅ **POS can run locally** (no public URL needed for webhooks)
- ✅ **Uses existing Fiuu credentials** already configured in WooCommerce
- ✅ **Simpler implementation** - WooCommerce handles all payment gateway logic
- ✅ **Proven reliability** - leverage WooCommerce's battle-tested payment system

## Payment Flow

```
1. Customer selects items in POS
2. POS creates order in WooCommerce (status: 'pending')
3. WooCommerce returns order with payment_url
4. POS displays QR code / payment link to customer
5. Customer pays via WooCommerce checkout (Fiuu plugin)
6. Fiuu → WooCommerce webhook (already configured)
7. WooCommerce updates order status to 'processing'
8. POS polls WooCommerce, detects payment completion
9. POS shows success message and proceeds to order preparation
```

## Prerequisites

### 1. WooCommerce Fiuu Plugin

Ensure the Fiuu plugin is installed and configured in WooCommerce:
- **Plugin:** "RMS (Fiuu) WooCommerce payment gateway with block checkout support"
- **Settings:** WooCommerce → Settings → Payments → Fiuu/RMS
- **Credentials:** Merchant ID, Verify Key, Secret Key configured
- **Webhooks:** Already handled by WooCommerce plugin

### 2. WooCommerce API Access

Your POS needs WooCommerce REST API credentials:
```bash
# In .env.local
WC_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WC_CONSUMER_SECRET=cs_xxxxxxxxxxxxx
WC_API_URL=https://coffee-oasis.com.my/wp-json/wc/v3
```

## Implementation

### 1. Create Order with Payment

```typescript
// API Route: POST /api/orders/create-with-payment
const response = await fetch('/api/orders/create-with-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    line_items: [
      { product_id: 123, quantity: 2 },
      { product_id: 456, quantity: 1 },
    ],
    billing: {
      first_name: 'John',
      email: 'john@example.com',
      phone: '0123456789',
    },
  }),
});

const { order, payment } = await response.json();
// payment.paymentURL = "https://coffee-oasis.com.my/checkout/order-pay/12345/?key=wc_..."
```

### 2. Display Payment to Customer

```tsx
import PaymentDisplay from '@/components/PaymentDisplay';

function CheckoutPage() {
  const [order, setOrder] = useState(null);

  const handleCheckout = async () => {
    const response = await fetch('/api/orders/create-with-payment', {
      method: 'POST',
      body: JSON.stringify({ line_items: cartItems }),
    });
    const { order, payment } = await response.json();
    setOrder(order);
  };

  return (
    <div>
      {!order ? (
        <button onClick={handleCheckout}>Proceed to Payment</button>
      ) : (
        <PaymentDisplay
          orderID={order.id}
          paymentURL={order.payment_url}
          amount={order.total}
          onSuccess={() => router.push('/order-complete')}
        />
      )}
    </div>
  );
}
```

The `PaymentDisplay` component automatically:
- Generates QR code from payment URL
- Polls order status every 3 seconds
- Detects payment completion
- Calls `onSuccess` when paid

### 3. Manual Payment Status Polling

If you need custom polling logic:

```typescript
import { usePaymentStatus } from '@/lib/hooks/usePaymentStatus';

function CustomPaymentScreen({ orderID }) {
  const { status, isPolling, order } = usePaymentStatus({
    orderID,
    enabled: true, // Auto-start polling
    interval: 3000, // Check every 3 seconds
    timeout: 600000, // Stop after 10 minutes
    onSuccess: (order) => {
      console.log('Payment confirmed!', order);
      // Navigate to completion page
    },
    onFailure: (order) => {
      console.log('Payment failed', order);
      // Show error message
    },
  });

  return (
    <div>
      <p>Status: {status}</p>
      <p>{isPolling ? 'Checking payment...' : 'Not polling'}</p>
    </div>
  );
}
```

## Payment Service API

### `getPaymentInfo(order)`
Extracts payment information from WooCommerce order:
```typescript
const payment = getPaymentInfo(order);
// { orderID, paymentURL, status, total, currency }
```

### `isOrderPaid(order)`
Checks if order has been paid:
```typescript
if (isOrderPaid(order)) {
  // Payment confirmed, proceed with order
}
```

### `pollPaymentStatus(orderID, onStatusChange, options)`
Polls order status until payment completes:
```typescript
const cleanup = pollPaymentStatus(
  12345,
  (status, order) => {
    console.log('Status changed:', status);
  },
  {
    interval: 3000, // Poll every 3 seconds
    timeout: 600000, // Stop after 10 minutes
    onError: (err) => console.error(err),
  }
);

// Stop polling manually
cleanup();
```

### `generatePaymentQR(paymentURL)`
Generates QR code image (base64 data URL):
```typescript
const qrCodeDataURL = await generatePaymentQR(order.payment_url);
// "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
```

## Order Status Mapping

| WooCommerce Status | Meaning | POS Action |
|-------------------|---------|-----------|
| `pending` | Awaiting payment | Show payment QR/link |
| `processing` | Payment received | Start preparing order |
| `on-hold` | Payment received (manual review) | Start preparing order |
| `completed` | Order fulfilled | Archive order |
| `failed` | Payment failed | Offer retry or cancel |
| `cancelled` | Order cancelled | Archive order |
| `refunded` | Payment refunded | Archive order |

## Troubleshooting

### Issue: No payment_url in order response

**Cause:** WooCommerce payment gateway not configured or order status not requiring payment.

**Solution:**
1. Check WooCommerce → Settings → Payments → Fiuu is enabled
2. Ensure order is created with `status: 'pending'`
3. Verify Fiuu plugin is active and configured

### Issue: Payment completed but POS doesn't detect it

**Cause:** Polling stopped or order status not updating.

**Solution:**
1. Check WooCommerce order in admin - is status `processing`?
2. Check Fiuu webhook logs in WooCommerce
3. Verify Fiuu credentials in WooCommerce settings
4. Check browser console for polling errors

### Issue: QR code not generating

**Cause:** `qrcode` package not installed.

**Solution:**
```bash
npm install qrcode @types/qrcode
```

### Issue: Customer paid but left page before confirmation

**Solution:** Order status is still updated in WooCommerce. Customer can:
1. Check order status in their account
2. Staff can verify in WooCommerce admin
3. POS will show order as paid when viewing order list

## Testing

### 1. Test Order Creation
```bash
curl -X POST http://localhost:3000/api/orders/create-with-payment \
  -H "Content-Type: application/json" \
  -d '{
    "line_items": [{"product_id": 123, "quantity": 1}]
  }'
```

Expected response includes `payment.paymentURL`.

### 2. Test Payment Flow
1. Create order via POS
2. Display payment QR code
3. Scan QR and complete payment
4. Verify POS detects payment within 3 seconds
5. Check order status changed to `processing`

### 3. Test Polling
Open browser console and run:
```javascript
const response = await fetch('/api/orders/12345');
const order = await response.json();
console.log('Order status:', order.status);
```

Repeat every few seconds to verify status updates.

## Future: Direct Fiuu Integration

When you're ready to migrate away from WooCommerce, we have a **custom Fiuu integration** already built (stored in `_future-direct-fiuu/` folder).

Benefits of direct integration:
- Full control over payment flow
- No WooCommerce dependency
- Custom payment UI
- Direct Fiuu webhooks to your app

Migration will require:
- Deploying POS to public URL (for webhooks)
- Registering webhook URLs in Fiuu portal
- Migrating payment data from WooCommerce

## Code Structure

```
lib/
  ├── paymentService.ts              # Payment helpers
  └── hooks/
      └── usePaymentStatus.ts        # React hook for polling

components/
  └── PaymentDisplay.tsx             # Payment QR/link UI

app/api/orders/
  └── create-with-payment/route.ts   # Order + payment endpoint

_future-direct-fiuu/                 # Direct Fiuu integration (future use)
  ├── lib/fiuuService.ts
  ├── app/api/payments/
  └── FIUU_PAYMENT_SETUP.md
```

## Support

- **WooCommerce Docs:** https://woocommerce.com/document/woocommerce-rest-api/
- **Fiuu Plugin Docs:** Contact Fiuu support
- **Fiuu Merchant Portal:** https://merchant.fiuu.com

## Summary

**Current Setup (WooCommerce):**
- ✅ Simple, reliable, POS runs locally
- ✅ Uses existing Fiuu plugin
- ✅ No deployment needed for payments

**Future Setup (Direct Fiuu):**
- Requires POS deployment to public URL
- Direct Fiuu API integration
- Full control, no WooCommerce dependency
- Code already prepared in `_future-direct-fiuu/`

Start with WooCommerce integration, migrate to direct Fiuu when ready!
