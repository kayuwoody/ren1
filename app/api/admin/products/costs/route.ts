import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/products/costs
 * Returns all products with cost and margin calculations from local SQLite.
 */
export async function GET(req: Request) {
  try {
    const localProducts = getAllProducts();

    const transformed = localProducts.map((product) => {
      const currentPrice = product.basePrice;
      const unitCost = product.unitCost || 0;
      const grossProfit = currentPrice - unitCost;
      const grossMargin = currentPrice > 0 ? (grossProfit / currentPrice) * 100 : 0;

      return {
        id: product.id,
        wcId: product.wcId,
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentPrice,
        unitCost,
        grossProfit,
        grossMargin,
        stockQuantity: product.stockQuantity || 0,
        imageUrl: product.imageUrl,
      };
    });

    return NextResponse.json({ products: transformed });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/costs');
  }
}
