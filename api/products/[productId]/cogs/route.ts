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

    // Parse bundle selection if provided
    let bundleSelection: { selectedMandatory: Record<string, string>; selectedOptional: string[] } | undefined;
    const selectedMandatoryParam = searchParams.get('selectedMandatory');
    const selectedOptionalParam = searchParams.get('selectedOptional');

    if (selectedMandatoryParam || selectedOptionalParam) {
      try {
        bundleSelection = {
          selectedMandatory: selectedMandatoryParam ? JSON.parse(selectedMandatoryParam) : {},
          selectedOptional: selectedOptionalParam ? JSON.parse(selectedOptionalParam) : [],
        };
      } catch (e) {
        console.warn('Failed to parse bundle selection:', e);
      }
    }

    // Calculate COGS using the recursive function (it handles product lookup by WC ID)
    const cogsResult = calculateProductCOGS(wcProductId, quantity, bundleSelection);

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
