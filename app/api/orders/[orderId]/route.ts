// app/api/orders/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { getWooOrder } from '@/lib/orderService';

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
    return NextResponse.json(
      { error: 'Could not load order.' },
      { status: 500 }
    );
  }
}
