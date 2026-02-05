import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/products
 * Get all products from local database (no WooCommerce sync)
 * SQLite is the source of truth for product data
 */
export async function GET(req: Request) {
  try {
    // Get all products from local database (includes COGS from recipes)
    const localProducts = getAllProducts();

    // Transform for API response
    const transformedProducts = localProducts.map((product) => {
      return {
        id: product.id,
        wcId: product.wcId,
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentPrice: product.basePrice,
        supplierCost: product.supplierCost,
        unitCost: product.unitCost,
        comboPriceOverride: product.comboPriceOverride,
        supplier: product.supplier,
        imageUrl: product.imageUrl,
        stockQuantity: product.stockQuantity ?? null,
        manageStock: product.manageStock ?? false,
      };
    });

    return NextResponse.json({
      products: transformedProducts,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/products');
  }
}
