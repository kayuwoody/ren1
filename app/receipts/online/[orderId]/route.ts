import { NextResponse } from 'next/server';

const BUCKET = 'receipts';

/**
 * Serve an online-order receipt. bubu1 uploads these to the shared receipts
 * bucket as `online-order-{id}.html`; this route fetches and serves it with the
 * correct content type so it renders in-browser from the POS.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const filename = `online-order-${orderId}.html`;
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
