import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { getAllMaterials } from '@/lib/db/materialService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/purchase-orders/items
 *
 * Get all materials and products for selection in purchase orders
 */
export async function GET() {
  try {
    const materials = getAllMaterials();
    const products = getAllProducts();

    return NextResponse.json({
      materials,
      products,
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/items');
  }
}
