// app/api/create-order/route.ts
import { NextResponse } from 'next/server';
import { createWooOrder } from '@/lib/orderService';

export async function POST(request: Request) {
  const payload = await request.json();

  // 1) Basic validation
  if (!Array.isArray(payload.line_items) || payload.line_items.length === 0) {
    return NextResponse.json(
      { error: 'Must supply at least one line_items entry' },
      { status: 400 }
    );
  }

  try {
    // 2) Attempt to create the order
    const order = await createWooOrder(payload);
    console.log("payload in create-order text:",order);
    return NextResponse.json(order, { status: 201 });
  } catch (err: any) {
    // 3) Surface WooCommerce error message if available
    console.error('[create-order] Error creating Woo order:', err);

    let message = err.message || 'Unknown error';
    let status = 500;

    // Axios errors from the Woo API include response.data
    if (err.response?.data) {
      message = err.response.data.message || JSON.stringify(err.response.data);
      status = err.response.status || 400;
    }

    return NextResponse.json({ error: message }, { status });
  }
}
