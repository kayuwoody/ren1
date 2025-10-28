import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { syncProductFromWooCommerce, getAllProducts } from '@/lib/db/productService';

/**
 * GET /api/admin/products
 * Fetch all products from WooCommerce and sync to local database
 */
export async function GET(req: Request) {
  try {
    const { data: wcProducts } = (await wcApi.get('products', {
      per_page: 100,
      orderby: 'title',
      order: 'asc'
    })) as { data: any };

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

    // Transform for API response with current price from WooCommerce
    const transformedProducts = localProducts.map((product) => {
      const wcProduct = wcProducts.find((p: any) => p.id === product.wcId);
      return {
        id: product.id,
        wcId: product.wcId,
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentPrice: wcProduct ? parseFloat(wcProduct.price) || 0 : product.basePrice,
        unitCost: product.unitCost,
        imageUrl: product.imageUrl,
      };
    });

    return NextResponse.json({ products: transformedProducts });
  } catch (err: any) {
    console.error('❌ Failed to fetch products:', err);
    return NextResponse.json(
      { error: 'Failed to fetch products', detail: err.message },
      { status: 500 }
    );
  }
}
