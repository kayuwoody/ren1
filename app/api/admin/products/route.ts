import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { syncProductFromWooCommerce, getAllProducts } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';
import { uploadCombosToVercelBlob, isVercelBlobConfigured } from '@/lib/vercelBlobService';

/**
 * GET /api/admin/products
 * Fetch all products from WooCommerce and sync to local database
 * Then upload combos to Vercel Blob for customer app consumption
 */
export async function GET(req: Request) {
  try {
    // Fetch all products including private ones (used for hidden modifiers)
    const wcProducts = await fetchAllWooPages('products', {
      orderby: 'title',
      order: 'asc',
      status: 'any', // Include publish, draft, pending, private, etc.
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

    // Sync combos to Vercel Blob (after WooCommerce sync)
    let blobUrl: string | null = null;
    if (isVercelBlobConfigured()) {
      try {
        console.log('\n☁️  Syncing combos to Vercel Blob...');
        blobUrl = await uploadCombosToVercelBlob();
        console.log(`✅ Combos synced to Vercel Blob: ${blobUrl}\n`);
      } catch (blobError: any) {
        console.error('⚠️  Vercel Blob sync failed (non-fatal):', blobError.message);
        // Don't fail the whole request if blob sync fails
      }
    } else {
      console.log('⏭️  Skipping Vercel Blob sync (BLOB_READ_WRITE_TOKEN not configured)');
    }

    return NextResponse.json({
      products: transformedProducts,
      blobSyncStatus: blobUrl ? 'success' : 'skipped',
      blobUrl,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/products');
  }
}
