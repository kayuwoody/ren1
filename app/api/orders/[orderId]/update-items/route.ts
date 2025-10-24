import { NextResponse } from 'next/server';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';

/**
 * PATCH /api/orders/[orderId]/update-items
 *
 * Update line_items on a pending order
 * Only allowed for orders with status: pending
 * Used when user modifies cart before paying
 */
export async function PATCH(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    const { orderId } = params;
    const { line_items } = await req.json();

    if (!line_items || !Array.isArray(line_items)) {
      return NextResponse.json(
        { error: 'line_items array required' },
        { status: 400 }
      );
    }

    // 1. Fetch existing order
    const existing = await getWooOrder(orderId);

    // 2. Only allow updates on pending orders
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only update pending orders' },
        { status: 400 }
      );
    }

    // 3. Update line_items
    const updated = await updateWooOrder(orderId, {
      line_items
    });

    console.log(`✅ Updated line_items for order #${orderId}`);

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('❌ Update line_items failed:', err);
    return NextResponse.json(
      { error: 'Failed to update order', detail: err.message },
      { status: 500 }
    );
  }
}
