import { NextResponse } from 'next/server';
import { getAllProducts, upsertProduct, getProductBySku } from '@/lib/db/productService';
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
        quantityPerCarton: product.quantityPerCarton ?? null,
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, sku, category, basePrice, manageStock, imageUrl, supplier, quantityPerCarton } = body;

    if (!name || !sku || !category) {
      return NextResponse.json({ error: 'name, sku, and category are required' }, { status: 400 });
    }

    const existing = getProductBySku(sku);
    if (existing) {
      return NextResponse.json({ error: `A product with SKU "${sku}" already exists` }, { status: 409 });
    }

    const product = upsertProduct({
      name,
      sku,
      category,
      basePrice: parseFloat(basePrice) || 0,
      supplierCost: 0,
      unitCost: 0,
      stockQuantity: 0,
      manageStock: manageStock ?? false,
      imageUrl: imageUrl || undefined,
      supplier: supplier || undefined,
      quantityPerCarton: quantityPerCarton || undefined,
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/admin/products');
  }
}
