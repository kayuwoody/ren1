import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createWooOrder } from '@/lib/orderService';

export async function POST(req: Request) {
   try {
    const body = await req.json();
    const { line_items, guestId, meta_data: extraMeta = [] } = body;

    // Validate line_items
    if (!Array.isArray(line_items) || line_items.length === 0) {
      return NextResponse.json(
        { error: 'Must supply at least one line_items entry' },
        { status: 400 }
      );
    }

    // Logged‑in user?
    const userIdCookie = cookies().get('userId')?.value;
    const userId = userIdCookie ? Number(userIdCookie) : undefined;

    // Compute kitchen timing window
    const now = Date.now();
    const duration = 2 * 60_000 * line_items.length; // 2min per item
    const startTime = String(now);
    const endTime   = String(now + duration);

    // Guest fallback (only used if no userId)
    // const guestId = userId ? undefined : body.guestId;

    // Build the full payload, embedding both guest/user and timer meta
    const payload = {
      line_items,
      userId,
      guestId: userId ? undefined : guestId,
      meta_data: [
        ...extraMeta,
        { key: 'startTime', value: startTime },
        { key: 'endTime',   value: endTime },
      ],
    };
console.log("payload: ",payload);
    const order = await createWooOrder(payload);
    return NextResponse.json(order, { status: 201 });
  } catch (err: any) {
    // WooCommerce errors often include response.data
    const wooErr = err?.response?.data ?? err?.message ?? err;
    console.error('❌ /api/create-order error:', wooErr);
    return NextResponse.json(
      { error: 'Order creation failed', detail: wooErr },
      { status: 500 }
    );
  }
}
