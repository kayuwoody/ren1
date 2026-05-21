# Bubu1 Receipt Generation — Integration Guide

POS currently generates HTML receipts and uploads them to Supabase Storage. Bubu1 (customer app) needs to generate receipts for online orders using the same approach.

## Storage Setup

Receipts live in a **public** Supabase Storage bucket called `receipts`.

- Bucket: `receipts`
- Access: Public (no auth needed to read)
- File pattern: `order-{orderId}.html` for POS orders
- Mascot image: `mascot.jpg` in the bucket root

### Public URL format

```
{SUPABASE_URL}/storage/v1/object/public/receipts/order-{orderId}.html
```

Example:
```
https://xxx.supabase.co/storage/v1/object/public/receipts/order-42.html
```

## What POS Does

1. After payment, POS calls `/api/receipts/generate` with the order ID
2. The API generates a self-contained HTML file (no JS, no external CSS)
3. Uploads it to Supabase Storage via the service role client
4. The receipt URL is printed as a QR code on the thermal receipt

The HTML generator is at `lib/receiptGenerator.ts`. It takes an order object and branch info, returns a complete HTML string.

## What Bubu1 Needs To Do

### 1. Generate receipts for online orders

After an online order is paid (Fiuu payment confirmed), generate and upload a receipt. You can either:

**Option A: Call the POS receipt API** (if the POS is running and online order is synced to SQLite)
```typescript
await fetch('https://pos-url/api/receipts/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId }),
});
```

**Option B: Generate and upload directly from bubu1** (recommended — no POS dependency)

Upload HTML to Supabase Storage using the service role or anon key (bucket is public for reads, you need auth for writes):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Use a different prefix to avoid collisions with POS order IDs
const filename = `online-order-${orderId}.html`;

await supabase.storage
  .from('receipts')
  .upload(filename, htmlContent, {
    contentType: 'text/html',
    upsert: true,
  });

// Public URL
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/receipts/${filename}`;
```

### 2. Receipt HTML structure

You can reuse the same HTML template style as the POS (`lib/receiptGenerator.ts`), or build your own. Key points:

- Self-contained HTML — no external JS or CSS dependencies
- The mascot image is at `{SUPABASE_URL}/storage/v1/object/public/receipts/mascot.jpg`
- Use absolute URLs for images (not relative paths)
- Keep it mobile-friendly (max-width ~28rem)

### 3. Display receipts to customers

To show a receipt in the app:

```typescript
// Construct the URL
const receiptUrl = `${SUPABASE_URL}/storage/v1/object/public/receipts/online-order-${orderId}.html`;

// Option 1: Link to it
<a href={receiptUrl} target="_blank">View Receipt</a>

// Option 2: Fetch and embed
const res = await fetch(receiptUrl);
const html = await res.text();
// Render in an iframe or dangerouslySetInnerHTML
```

### 4. Naming convention

To avoid ID collisions between POS and online orders:
- POS receipts: `order-{orderId}.html` (orderId is a sequential number from SQLite)
- Online receipts: `online-order-{orderId}.html` (orderId is the Supabase `online_orders.id` UUID)

## Mascot Image

The mascot (`mascot.jpg`) is uploaded to the bucket root during setup. Reference it in receipt HTML as:

```html
<img src="{SUPABASE_URL}/storage/v1/object/public/receipts/mascot.jpg" alt="Coffee Oasis Logo" />
```

## One-Time Setup

The POS has a setup endpoint that creates the bucket and uploads the mascot:

```bash
curl -X POST http://localhost:3000/api/receipts/setup
```

If the bucket already exists, this is safe to run again (idempotent).
