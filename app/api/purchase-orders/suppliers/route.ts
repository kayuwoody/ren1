import { NextResponse } from 'next/server';
import { getSuppliers } from '@/lib/db/purchaseOrderService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/purchase-orders/suppliers
 *
 * Get list of unique suppliers from both materials and products
 */
export async function GET() {
  try {
    const suppliers = getSuppliers();
    return NextResponse.json({ suppliers });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/suppliers');
  }
}
