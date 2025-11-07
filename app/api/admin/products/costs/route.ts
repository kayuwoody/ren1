import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { syncProductFromWooCommerce, getAllProducts } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/admin/products/costs
 * Fetch all products with cost and margin calculations
 */
export async function GET(req: Request) {
  try {
    const wcProducts = await fetchAllWooPages('products', {
      orderby: 'title',
      order: 'asc'
    });

    // Sync each product to local database
    wcProducts.forEach((wcProduct: any) => {
      try {
        syncProductFromWooCommerce(wcProduct);
      } catch (err) {
        console.error(`Failed to sync product ${wcProduct.id}:`, err);
      }
    });

    // Get all products from local database (includes COGS from recipes)
    const localProducts = getAllProducts();

    // Transform for API response with cost calculations
    const transformedProducts = localProducts.map((product) => {
      const wcProduct = wcProducts.find((p: any) => p.id === product.wcId);
      const currentPrice = wcProduct ? parseFloat(wcProduct.price) || 0 : product.basePrice;
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

    return NextResponse.json({ products: transformedProducts });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/costs');
  }
}
