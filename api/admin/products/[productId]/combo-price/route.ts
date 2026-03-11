import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * PATCH /api/admin/products/[productId]/combo-price
 * Update a product's combo price override
 * When set, this price is used instead of calculated price (base + add-ons)
 * When null/empty, normal calculation applies
 */
export async function PATCH(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;
    const { comboPriceOverride } = await req.json();

    console.log(`📝 Updating product ${productId} comboPriceOverride to ${comboPriceOverride === null ? 'NULL (removed)' : `RM ${comboPriceOverride}`}`);

    if (comboPriceOverride !== null && (typeof comboPriceOverride !== 'number' || comboPriceOverride < 0)) {
      return validationError('Invalid comboPriceOverride. Must be null or a non-negative number.', '/api/admin/products/[productId]/combo-price');
    }

    // Check if product exists and show current value
    const currentProduct = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId) as any;
    if (!currentProduct) {
      return notFoundError('Product not found', '/api/admin/products/[productId]/combo-price');
    }
    console.log(`   Current comboPriceOverride: ${currentProduct.comboPriceOverride ? `RM ${currentProduct.comboPriceOverride}` : 'Not set'}`);

    // Update product comboPriceOverride
    const stmt = db.prepare(`
      UPDATE Product
      SET comboPriceOverride = ?, updatedAt = datetime('now')
      WHERE id = ?
    `);

    const result = stmt.run(comboPriceOverride, productId);

    if (result.changes === 0) {
      console.error(`❌ Failed to update - no rows changed`);
      return notFoundError('Product not found', '/api/admin/products/[productId]/combo-price');
    }

    // Get updated product
    const product = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId) as any;

    if (comboPriceOverride !== null) {
      console.log(`✅ Updated product ${productId} comboPriceOverride to RM ${comboPriceOverride.toFixed(2)}`);
      console.log(`   Verified new value: RM ${product.comboPriceOverride}`);
    } else {
      console.log(`✅ Removed combo price override for product ${productId}`);
      console.log(`   Product will use normal price calculation`);
    }

    return NextResponse.json({
      success: true,
      product,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]/combo-price');
  }
}
