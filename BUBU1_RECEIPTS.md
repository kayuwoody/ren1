# Bubu1 Receipt Generation — Integration Guide

POS generates HTML receipts and uploads them to Supabase Storage. Bubu1 (customer app) needs to generate receipts for online orders and **serve all receipts via a proxy route** (Supabase Storage serves `.html` as `text/plain`).

## Storage Setup

Receipts live in a **public** Supabase Storage bucket called `receipts`.

- Bucket: `receipts`
- Access: Public (no auth needed to read)
- File pattern: `order-{orderId}.html` for POS orders
- Mascot image: `mascot.jpg` in the bucket root

**Important:** Supabase Storage serves `.html` files with `Content-Type: text/plain`, so browsers display raw HTML source instead of rendering it. All receipt links must go through a proxy route (see below).

## Receipt Proxy Route (Required)

POS receipt QR codes and all receipt links point to:

```
https://www.coffee-oasis.com/receipts/{orderId}
```

Bubu1 **must** add this route to serve receipts with the correct content type. Create `app/receipts/[orderId]/route.ts`:

```typescript
import { NextResponse } from 'next/server';

const BUCKET = 'receipts';

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const filename = `order-${orderId}.html`;
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;

  const res = await fetch(storageUrl, { cache: 'no-store' });

  if (!res.ok) {
    return new NextResponse('Receipt not found', { status: 404 });
  }

  const html = await res.text();

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
```

For online order receipts, add a similar route at `app/receipts/online/[orderId]/route.ts` using the `online-order-{orderId}.html` filename pattern.

## What POS Does

1. After payment, POS calls `/api/receipts/generate` with the order ID
2. The API generates a self-contained HTML file (no JS, no external CSS)
3. Uploads it to Supabase Storage via the REST API (direct PUT with service role key)
4. The receipt QR code on the thermal receipt points to `https://www.coffee-oasis.com/receipts/{orderId}`

The HTML generator is at `lib/receiptGenerator.ts`. It takes an order object and branch info, returns a complete HTML string.

## What Bubu1 Needs To Do

### 1. Add the receipt proxy route (above)

This is the highest priority — without it, existing POS receipts show as raw text.

### 2. Generate receipts for online orders

After an online order is paid (Fiuu payment confirmed), generate and upload a receipt.

Upload HTML to Supabase Storage using the REST API (the JS client ignores content type):

```typescript
const filename = `online-order-${orderId}.html`;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const res = await fetch(
  `${supabaseUrl}/storage/v1/object/receipts/${filename}`,
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'text/html; charset=utf-8',
      'x-upsert': 'true',
    },
    body: htmlContent,
  }
);
```

### 3. Receipt HTML structure

You can reuse the same HTML template style as the POS (`lib/receiptGenerator.ts`), or build your own. Key points:

- Self-contained HTML — no external JS or CSS dependencies
- The mascot image is at `{SUPABASE_URL}/storage/v1/object/public/receipts/mascot.jpg`
- Use absolute URLs for images (not relative paths)
- Keep it mobile-friendly (max-width ~28rem)

### 4. Display receipts to customers

Link to the proxy route, not the raw Supabase URL:

```typescript
// POS order receipt
const receiptUrl = `https://www.coffee-oasis.com/receipts/${orderId}`;

// Online order receipt
const receiptUrl = `https://www.coffee-oasis.com/receipts/online/${orderId}`;
```

### 5. Naming convention

To avoid ID collisions between POS and online orders:
- POS receipts: `order-{orderId}.html` (orderId is a UUID)
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
