// app/api/orders/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    // Fetch the *full* order, meta_data included
    const order = await getWooOrder(params.orderId);
    return NextResponse.json(order, { status: 200 });
  } catch (err: any) {
    console.error('❌ /api/orders/[orderId] failed:', err);

    // Check if this is a 404 (order not found/deleted)
    const statusCode = err?.data?.status || err?.response?.status;
    const errorCode = err?.code;

    if (statusCode === 404 || errorCode === 'woocommerce_rest_shop_order_invalid_id') {
      return NextResponse.json(
        { error: 'Order not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Could not load order.' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const body = await req.json();
    const order = await updateWooOrder(params.orderId, body);
    return NextResponse.json(order, { status: 200 });
  } catch (err: any) {
    console.error('❌ PATCH /api/orders/[orderId] failed:', err);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}
