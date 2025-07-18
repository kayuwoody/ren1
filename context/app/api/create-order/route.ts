import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createWooOrder, NewOrderPayload } from '@/lib/orderService';

type IncomingLineItem = {
  product_id: number | string;
  quantity: number | string;
};

type IncomingBody = {
  line_items?: IncomingLineItem[];
  guestId?: string;
  meta_data?: Array<{ key: string; value: any }>;
};

function normalizeLineItems(raw?: IncomingLineItem[]) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((li) => ({
      product_id: Number(li.product_id),
      quantity: Number(li.quantity),
    }))
    .filter((li) => Number.isFinite(li.product_id) && li.product_id > 0 && li.quantity > 0);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as IncomingBody;
    const line_items = normalizeLineItems(body.line_items);

    if (line_items.length === 0) {
      return NextResponse.json(
        { error: 'Must supply at least one valid line item' },
        { status: 400 }
      );
    }

    // Logged‑in user?
    const userIdCookie = cookies().get('userId')?.value;
    const userId = userIdCookie ? Number(userIdCookie) : undefined;

    // Guest fallback (only used if no userId)
    const guestId = userId ? undefined : body.guestId;

    const payload: NewOrderPayload = {
      line_items,
      userId,
      guestId,
      meta_data: body.meta_data ?? [],
    };

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
