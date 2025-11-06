// app/api/orders/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { getWooOrder } from '@/lib/orderService';
import { handleApiError, notFoundError, ErrorType } from '@/lib/api/error-handler';

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    // Fetch the *full* order, meta_data included
    const order = await getWooOrder(params.orderId);
    return NextResponse.json(order, { status: 200 });
  } catch (error: any) {
    // Check if this is a 404 (order not found/deleted)
    const statusCode = error?.data?.status || error?.response?.status;
    const errorCode = error?.code;

    if (statusCode === 404 || errorCode === 'woocommerce_rest_shop_order_invalid_id') {
      return notFoundError('Order not found', '/api/orders/[orderId]');
    }

    return handleApiError(error, '/api/orders/[orderId]');
  }
}
