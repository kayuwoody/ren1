import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { updateBranchStock, syncLegacyStockColumns } from '@/lib/db/branchStockService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * POST /api/products/update-stock
 *
 * Update product stock quantity via BranchStock.
 * Legacy Product.stockQuantity is synced via syncLegacyStockColumns().
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

    const product = db.prepare('SELECT id, wcId, name, manageStock, stockQuantity FROM Product WHERE id = ?').get(productId) as {
      id: string;
      wcId?: number;
      name: string;
      manageStock: number;
      stockQuantity: number;
    } | undefined;

    if (!product) {
      return notFoundError(`Product not found: ${productId}`, '/api/products/update-stock');
    }

    const previousStock = product.stockQuantity;
    const branchId = getBranchIdFromRequest(req);

    // Update BranchStock (sole source of truth)
    updateBranchStock(branchId, 'product', productId, stockQuantity);

    // Sync legacy columns
    syncLegacyStockColumns();

    console.log(`✅ Updated stock for ${product.name}: ${previousStock} → ${stockQuantity} (branch: ${branchId})`);

    return NextResponse.json({
      success: true,
      localUpdated: true,
      stockQuantity,
      productId,
      productName: product.name,
    });
  } catch (error) {
    return handleApiError(error, '/api/products/update-stock');
  }
}
