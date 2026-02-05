import { NextResponse } from 'next/server';
import { getAllProducts, syncProductFromWooCommerce } from '@/lib/db/productService';
import { getAllMaterials } from '@/lib/db/materialService';
import { handleApiError } from '@/lib/api/error-handler';
import { wcApi } from '@/lib/wooClient';

export const dynamic = 'force-dynamic'; // ensures this API route runs fresh each time

/**
 * GET /api/purchase-orders/items
 *
 * Get all materials and products for selection in purchase orders
 * - Materials: Fetched from local database (source of truth)
 * - Products: Synced from WooCommerce to ensure accurate stock levels
 */
export async function GET() {
  try {
    const materials = getAllMaterials();

    // Sync products from WooCommerce to ensure current stock levels
    console.log('🔄 Syncing products from WooCommerce for purchase orders...');

    try {
      const { data: wcProducts } = (await wcApi.get('products', {
        per_page: 100,
        status: 'any', // Include all products
      })) as { data: any };

      console.log(`✅ WooCommerce returned ${wcProducts.length} products`);

      // Sync WooCommerce products to local cache
      let syncedCount = 0;
      for (const wcProduct of wcProducts) {
        try {
          syncProductFromWooCommerce(wcProduct);
          syncedCount++;
        } catch (err) {
          console.error(`⚠️ Failed to sync product ${wcProduct.id}:`, err);
        }
      }

      console.log(`✅ Synced ${syncedCount}/${wcProducts.length} products to local cache`);
    } catch (syncError) {
      console.error('⚠️ WooCommerce sync failed, using cached product data:', syncError);
      // Continue with cached data if sync fails
    }

    // Get fresh product data from database (now with updated stock levels)
    const products = getAllProducts();

    return NextResponse.json({
      materials,
      products,
    });
  } catch (error) {
    return handleApiError(error, '/api/purchase-orders/items');
  }
}
