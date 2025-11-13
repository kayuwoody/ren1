import { NextResponse } from 'next/server';
import { markPurchaseOrderReceived } from '@/lib/db/purchaseOrderService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * POST /api/purchase-orders/[id]/receive
 *
 * Mark a purchase order as received and update inventory
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const purchaseOrder = markPurchaseOrderReceived(params.id);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${params.id}`, '/api/purchase-orders/[id]/receive');
    }

    return NextResponse.json({
      ...purchaseOrder,
      message: 'Purchase order marked as received and inventory updated',
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]/receive');
  }
}
