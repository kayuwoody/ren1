import { NextResponse } from 'next/server';
import { markPurchaseOrderReceived } from '@/lib/db/purchaseOrderService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * POST /api/purchase-orders/[id]/receive
 *
 * Mark a purchase order as received and update inventory (local + WooCommerce)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Optional partial-receipt payload: cumulative received qty per line item.
    // No body → receive everything in full (backward compatible).
    let receivedItems: Array<{ itemId: string; receivedQuantity: number }> | undefined;
    try {
      const body = await req.json();
      if (Array.isArray(body?.items)) {
        receivedItems = body.items
          .filter((i: any) => i && typeof i.itemId === 'string')
          .map((i: any) => ({ itemId: i.itemId, receivedQuantity: Number(i.receivedQuantity) || 0 }));
      }
    } catch {
      // no/invalid body — fall through to full receipt
    }

    const purchaseOrder = await markPurchaseOrderReceived(id, receivedItems);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${id}`, '/api/purchase-orders/[id]/receive');
    }

    return NextResponse.json({
      ...purchaseOrder,
      message: purchaseOrder.status === 'partial'
        ? 'Partial delivery received. Inventory updated; remaining items can be received later.'
        : 'Purchase order fully received. Inventory updated.',
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]/receive');
  }
}
