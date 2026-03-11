import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * PATCH /api/admin/products/[productId]/cost
 * Update a product's base supplier cost (acquisition cost)
 * Note: unitCost (calculated COGS) is computed separately from supplierCost + recipe costs
 */
export async function PATCH(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;
    const { supplierCost } = await req.json();

    console.log(`📝 Updating product ${productId} supplierCost to RM ${supplierCost}`);

    if (typeof supplierCost !== 'number' || supplierCost < 0) {
      return validationError('Invalid supplierCost. Must be a non-negative number.', '/api/admin/products/[productId]/cost');
    }

    // Check if product exists and show current value
    const currentProduct = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId) as any;
    if (!currentProduct) {
      return notFoundError('Product not found', '/api/admin/products/[productId]/cost');
    }
    console.log(`   Current supplierCost: RM ${currentProduct.supplierCost || 0}`);

    // Update product supplierCost
    const stmt = db.prepare(`
      UPDATE Product
      SET supplierCost = ?, updatedAt = datetime('now')
      WHERE id = ?
    `);

    const result = stmt.run(supplierCost, productId);

    if (result.changes === 0) {
      console.error(`❌ Failed to update - no rows changed`);
      return notFoundError('Product not found', '/api/admin/products/[productId]/cost');
    }

    // Get updated product
    const product = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId) as any;

    console.log(`✅ Updated product ${productId} supplierCost to RM ${supplierCost.toFixed(2)}`);
    console.log(`   Verified new value: RM ${product.supplierCost}`);

    return NextResponse.json({
      success: true,
      product,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]/cost');
  }
}
