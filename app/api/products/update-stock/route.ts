import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { wcApi } from '@/lib/wooClient';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * POST /api/products/update-stock
 *
 * Update product stock quantity in local database and WooCommerce
 *
 * Body: {
 *   productId: string,  // Local product ID
 *   stockQuantity: number
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, stockQuantity } = body;

    if (!productId) {
      return validationError('productId is required', '/api/products/update-stock');
    }

    if (stockQuantity === undefined || stockQuantity === null) {
      return validationError('stockQuantity is required', '/api/products/update-stock');
    }

    if (stockQuantity < 0) {
      return validationError('stockQuantity cannot be negative', '/api/products/update-stock');
    }

    // Get product from local database
    const product = db.prepare('SELECT id, wcId, name, manageStock FROM Product WHERE id = ?').get(productId) as {
      id: string;
      wcId?: number;
      name: string;
      manageStock: number;
    } | undefined;

    if (!product) {
      return notFoundError(`Product not found: ${productId}`, '/api/products/update-stock');
    }

    // Update local database
    const beforeUpdate = db.prepare('SELECT stockQuantity FROM Product WHERE id = ?').get(productId) as { stockQuantity: number } | undefined;
    db.prepare('UPDATE Product SET stockQuantity = ? WHERE id = ?').run(stockQuantity, productId);
    const afterUpdate = db.prepare('SELECT stockQuantity FROM Product WHERE id = ?').get(productId) as { stockQuantity: number } | undefined;
    console.log(`✅ Updated local stock for ${product.name}: ${beforeUpdate?.stockQuantity} → ${stockQuantity} (verified: ${afterUpdate?.stockQuantity})`);

    // Update WooCommerce if product has wcId and manages stock
    if (product.wcId && product.manageStock) {
      try {
        await wcApi.put(`products/${product.wcId}`, {
          stock_quantity: stockQuantity,
        });
        console.log(`✅ Updated WooCommerce stock for ${product.name}: ${stockQuantity}`);
      } catch (wcError: any) {
        console.error(`❌ Failed to update WooCommerce stock:`, wcError.message);
        return NextResponse.json({
          success: true,
          localUpdated: true,
          wooCommerceUpdated: false,
          error: `Local stock updated but WooCommerce sync failed: ${wcError.message}`,
          stockQuantity,
        }, { status: 207 }); // 207 Multi-Status
      }
    } else {
      const reason = !product.wcId
        ? 'No WooCommerce ID'
        : 'Stock management disabled in WooCommerce';
      console.log(`ℹ️  Skipped WooCommerce sync for ${product.name}: ${reason}`);
    }

    return NextResponse.json({
      success: true,
      localUpdated: true,
      wooCommerceUpdated: product.wcId && product.manageStock,
      stockQuantity,
      productId,
      productName: product.name,
    });
  } catch (error) {
    return handleApiError(error, '/api/products/update-stock');
  }
}
