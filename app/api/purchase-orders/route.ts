import { NextResponse } from 'next/server';
import {
  createPurchaseOrder,
  getAllPurchaseOrders,
} from '@/lib/db/purchaseOrderService';
import { handleApiError, validationError } from '@/lib/api/error-handler';

/**
 * GET /api/purchase-orders
 *
 * List all purchase orders with their items
 */
export async function GET() {
  try {
    const purchaseOrders = getAllPurchaseOrders();
    return NextResponse.json(purchaseOrders);
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders');
  }
}

/**
 * POST /api/purchase-orders
 *
 * Create a new purchase order
 *
 * Body: {
 *   supplier: string,
 *   notes?: string,
 *   orderDate?: string,
 *   expectedDeliveryDate?: string,
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
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validation
    if (!body.supplier) {
      return validationError('Supplier is required', '/api/purchase-orders');
    }

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return validationError('At least one item is required', '/api/purchase-orders');
    }

    // Validate items
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i];

      if (!item.itemType || !['material', 'product'].includes(item.itemType)) {
        return validationError(`Item ${i + 1}: itemType must be 'material' or 'product'`, '/api/purchase-orders');
      }

      if (item.itemType === 'material' && !item.materialId) {
        return validationError(`Item ${i + 1}: materialId is required for material items`, '/api/purchase-orders');
      }

      if (item.itemType === 'product' && !item.productId) {
        return validationError(`Item ${i + 1}: productId is required for product items`, '/api/purchase-orders');
      }

      if (!item.quantity || item.quantity <= 0) {
        return validationError(`Item ${i + 1}: quantity must be greater than 0`, '/api/purchase-orders');
      }

      if (!item.unit) {
        return validationError(`Item ${i + 1}: unit is required`, '/api/purchase-orders');
      }

      if (item.unitCost === undefined || item.unitCost < 0) {
        return validationError(`Item ${i + 1}: unitCost is required and must be >= 0`, '/api/purchase-orders');
      }
    }

    const purchaseOrder = createPurchaseOrder(body);

    return NextResponse.json(purchaseOrder, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders');
  }
}
