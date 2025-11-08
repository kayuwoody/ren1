// app/api/products/route.ts
import { NextResponse } from "next/server";
import { wcApi } from "@/lib/wooClient";
import { getAllProducts, syncProductFromWooCommerce, getProductByWcId } from "@/lib/db/productService";

export const dynamic = "force-dynamic"; // ensures this API route runs fresh each time

/**
 * GET /api/products
 *
 * Returns products with local-first caching:
 * 1. Check local SQLite cache first
 * 2. If cache is empty or products missing, fetch from WooCommerce
 * 3. Update local cache with WooCommerce data
 *
 * Query params:
 * - force_sync=true: Force fetch from WooCommerce even if cache exists
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const forceSync = url.searchParams.get('force_sync') === 'true';

  try {
    // Step 1: Get products from local cache
    const localProducts = getAllProducts();

    // Step 2: If cache is populated and no force sync, return cached products
    if (localProducts.length > 0 && !forceSync) {
      console.log(`✅ Returning ${localProducts.length} products from local cache`);

      // Convert local products to WooCommerce format for compatibility
      const wcFormatProducts = localProducts.map(product => ({
        id: product.wcId,
        name: product.name,
        sku: product.sku,
        price: product.basePrice.toString(),
        regular_price: product.basePrice.toString(),
        stock_quantity: product.stockQuantity,
        images: product.imageUrl ? [{ src: product.imageUrl }] : [],
        categories: [{ slug: product.category, name: product.category }],
        // Add any other fields your frontend expects
      }));

      return NextResponse.json(wcFormatProducts);
    }

    // Step 3: Fetch from WooCommerce (cache is empty or force sync)
    console.log(forceSync ? "🔄 Force syncing products from WooCommerce..." : "📦 Cache empty, fetching products from WooCommerce...");

    const { data: wcProducts } = (await wcApi.get("products", {
      per_page: 100,
      status: 'publish' // Only get published products
    })) as { data: any };

    console.log(`✅ WooCommerce returned ${wcProducts.length} products`);

    // Step 4: Sync WooCommerce products to local cache
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

    return NextResponse.json(wcProducts);
  } catch (error: any) {
    console.error("❌ Products fetch failed:", error);

    // If WooCommerce fetch fails, try to return cached products as fallback
    try {
      const fallbackProducts = getAllProducts();
      if (fallbackProducts.length > 0) {
        console.log(`⚠️ WooCommerce failed, returning ${fallbackProducts.length} cached products as fallback`);

        const wcFormatProducts = fallbackProducts.map(product => ({
          id: product.wcId,
          name: product.name,
          sku: product.sku,
          price: product.basePrice.toString(),
          regular_price: product.basePrice.toString(),
          stock_quantity: product.stockQuantity,
          images: product.imageUrl ? [{ src: product.imageUrl }] : [],
          categories: [{ slug: product.category, name: product.category }],
        }));

        return NextResponse.json(wcFormatProducts);
      }
    } catch (fallbackErr) {
      console.error("❌ Fallback to cache also failed:", fallbackErr);
    }

    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}