import { NextResponse } from 'next/server';
import { calculateProductCOGS } from '@/lib/db/inventoryConsumptionService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/products/[productId]/cogs
 * Calculate COGS for a product with optional quantity
 *
 * @param productId - WooCommerce product ID (number)
 * @param quantity - Quantity to calculate COGS for (default: 1)
 */
export async function GET(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const quantity = parseInt(searchParams.get('quantity') || '1');
    const wcProductId = parseInt(params.productId);

    if (isNaN(wcProductId)) {
      return NextResponse.json(
        { error: 'Invalid product ID' },
        { status: 400 }
      );
    }

    // Calculate COGS using the recursive function (it handles product lookup by WC ID)
    const cogsResult = calculateProductCOGS(wcProductId, quantity);

    if (cogsResult.totalCOGS === 0 && cogsResult.breakdown.length === 0) {
      // Product not found or has no recipe
      return NextResponse.json({
        totalCOGS: 0,
        breakdown: [],
        quantity,
        warning: 'Product has no recipe or COGS data',
      });
    }

    return NextResponse.json({
      totalCOGS: cogsResult.totalCOGS,
      breakdown: cogsResult.breakdown,
      quantity,
    });
  } catch (error) {
    return handleApiError(error, '/api/products/[productId]/cogs');
  }
}
