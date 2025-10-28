import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';

/**
 * GET /api/admin/products
 * Fetch all products from WooCommerce with local COGS data
 */
export async function GET(req: Request) {
  try {
    const { data: products } = (await wcApi.get('products', {
      per_page: 100,
      orderby: 'title',
      order: 'asc'
    })) as { data: any };

    // Transform WooCommerce products to include necessary fields
    const transformedProducts = products.map((product: any) => ({
      id: product.id.toString(),
      wcId: product.id,
      name: product.name,
      sku: product.sku || `product-${product.id}`,
      category: product.categories?.[0]?.name || 'Uncategorized',
      currentPrice: parseFloat(product.price) || 0,
      unitCost: 0, // Will be calculated from recipes
      imageUrl: product.images?.[0]?.src || null,
    }));

    return NextResponse.json({ products: transformedProducts });
  } catch (err: any) {
    console.error('❌ Failed to fetch products:', err);
    return NextResponse.json(
      { error: 'Failed to fetch products', detail: err.message },
      { status: 500 }
    );
  }
}
