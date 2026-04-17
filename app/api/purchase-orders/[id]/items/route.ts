import { NextResponse } from 'next/server';
import {
  updatePurchaseOrder,
  updatePurchaseOrderItems,
} from '@/lib/db/purchaseOrderService';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * PUT /api/purchase-orders/[id]/items
 *
 * Update purchase order items (draft only)
 *
 * Body: {
 *   items: Array<{
 *     itemType: 'material' | 'product',
 *     materialId?: string,
 *     productId?: string,
 *     quantity: number,
 *     unit: string,
 *     unitCost: number,
 *     notes?: string
 *   }>
 * }
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (!body.items || !Array.isArray(body.items)) {
      return validationError('Items array is required', '/api/purchase-orders/[id]/items');
    }

    if (body.items.length === 0) {
      return validationError('At least one item is required', '/api/purchase-orders/[id]/items');
    }

    const purchaseOrder = updatePurchaseOrderItems(id, body.items);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${id}`, '/api/purchase-orders/[id]/items');
    }

    return NextResponse.json(purchaseOrder);
  } catch (error: any) {
    if (error.message?.includes('Only draft purchase orders')) {
      return validationError(error.message, '/api/purchase-orders/[id]/items');
    }
    return handleApiError(error, '/api/purchase-orders/[id]/items');
  }
}
