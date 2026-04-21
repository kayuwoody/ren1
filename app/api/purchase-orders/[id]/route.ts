import { NextResponse } from 'next/server';
import {
  getPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  markPurchaseOrderReceived,
} from '@/lib/db/purchaseOrderService';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/purchase-orders/[id]
 *
 * Get a single purchase order by ID
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const purchaseOrder = getPurchaseOrder(id);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${id}`, '/api/purchase-orders/[id]');
    }

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]');
  }
}

/**
 * PATCH /api/purchase-orders/[id]
 *
 * Update a purchase order
 *
 * Body: {
 *   supplier?: string,
 *   status?: 'draft' | 'ordered' | 'received' | 'cancelled',
 *   notes?: string,
 *   orderDate?: string,
 *   expectedDeliveryDate?: string,
 *   receivedDate?: string
 * }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (body.status && !['draft', 'ordered', 'received', 'cancelled'].includes(body.status)) {
      return validationError('Invalid status. Must be: draft, ordered, received, or cancelled', '/api/purchase-orders/[id]');
    }

    const purchaseOrder = updatePurchaseOrder(id, body);

    if (!purchaseOrder) {
      return notFoundError(`Purchase order not found: ${id}`, '/api/purchase-orders/[id]');
    }

    return NextResponse.json(purchaseOrder);
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/[id]');
  }
}

/**
 * DELETE /api/purchase-orders/[id]
 *
 * Delete a purchase order (only if status is 'draft')
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = deletePurchaseOrder(id);

    if (!success) {
      return notFoundError(`Purchase order not found: ${id}`, '/api/purchase-orders/[id]');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message?.includes('Only draft purchase orders')) {
      return validationError(error.message, '/api/purchase-orders/[id]');
    }
    return handleApiError(error, '/api/purchase-orders/[id]');
  }
}
