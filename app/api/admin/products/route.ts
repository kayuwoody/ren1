import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { syncProductFromWooCommerce, getAllProducts } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/admin/products
 * Fetch all products from WooCommerce and sync to local database
 */
export async function GET(req: Request) {
  try {
    console.log('📦 Fetching products from WooCommerce...');
    const wcProducts = await fetchAllWooPages('products', {
      orderby: 'title',
      order: 'asc'
    });

    console.log(`✅ Fetched ${wcProducts.length} products from WooCommerce`);

    // Sync each product to local database
    let syncedCount = 0;
    let failedCount = 0;

    wcProducts.forEach((wcProduct: any) => {
      try {
        syncProductFromWooCommerce(wcProduct);
        syncedCount++;
      } catch (err) {
        failedCount++;
        console.error(`❌ Failed to sync product ${wcProduct.id} (${wcProduct.name}):`, err);
      }
    });

    console.log(`📊 Sync results: ${syncedCount} successful, ${failedCount} failed`);

    // Get all products from local database (includes COGS from recipes)
    const localProducts = getAllProducts();
    console.log(`💾 Local database has ${localProducts.length} products`);

    if (localProducts.length === 0 && wcProducts.length > 0) {
      console.error('⚠️  WARNING: WooCommerce has products but local database is empty! Check for sync errors above.');
    }

    // Transform for API response with current price from WooCommerce, stock from local DB
    const transformedProducts = localProducts.map((product) => {
      const wcProduct = wcProducts.find((p: any) => p.id === product.wcId);
      return {
        id: product.id,
        wcId: product.wcId,
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentPrice: wcProduct ? parseFloat(wcProduct.price) || 0 : product.basePrice,
        supplierCost: product.supplierCost,
        unitCost: product.unitCost,
        comboPriceOverride: product.comboPriceOverride,
        imageUrl: product.imageUrl,
        stockQuantity: product.stockQuantity ?? null, // Use local DB as source of truth
        manageStock: product.manageStock ?? false,
      };
    });

    // Debug: Log stock info
    const productsWithStock = transformedProducts.filter(p => p.manageStock);
    console.log(`📊 Products with stock tracking: ${productsWithStock.length}/${transformedProducts.length}`);
    if (productsWithStock.length > 0) {
      console.log(`📊 Sample stock data:`, {
        name: productsWithStock[0].name,
        manageStock: productsWithStock[0].manageStock,
        stockQuantity: productsWithStock[0].stockQuantity
      });
    }

    return NextResponse.json({ products: transformedProducts });
  } catch (error) {
    return handleApiError(error, '/api/admin/products');
  }
}
