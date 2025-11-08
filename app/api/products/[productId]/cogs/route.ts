import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/db/productService';
import { calculateProductCOGS } from '@/lib/db/inventoryConsumptionService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/products/[productId]/cogs
 * Calculate COGS for a product with optional quantity
 */
export async function GET(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const quantity = parseInt(searchParams.get('quantity') || '1');

    // Get product from local database
    const product = getProduct(params.productId);

    if (!product) {
      return notFoundError(`Product ${params.productId} not found`);
    }

    if (!product.wcId) {
      return NextResponse.json(
        { error: 'Product does not have a WooCommerce ID' },
        { status: 400 }
      );
    }

    // Calculate COGS using the recursive function
    const cogsResult = calculateProductCOGS(product.wcId, quantity);

    return NextResponse.json({
      totalCOGS: cogsResult.totalCOGS,
      breakdown: cogsResult.breakdown,
      quantity,
    });
  } catch (error) {
    return handleApiError(error, '/api/products/[productId]/cogs');
  }
}
