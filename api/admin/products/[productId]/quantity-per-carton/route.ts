import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * PATCH /api/admin/products/[productId]/quantity-per-carton
 * Update product quantity per carton
 */
export async function PATCH(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId: id } = params;
    const body = await req.json();
    const { quantityPerCarton } = body;

    // Validate quantityPerCarton (allow null to clear, must be positive integer if set)
    if (quantityPerCarton !== null && quantityPerCarton !== undefined) {
      if (typeof quantityPerCarton !== 'number' || quantityPerCarton < 1 || !Number.isInteger(quantityPerCarton)) {
        return validationError('Quantity per carton must be a positive integer or null', '/api/admin/products/[productId]/quantity-per-carton');
      }
    }

    // Check if product exists
    const product = db.prepare('SELECT id, name FROM Product WHERE id = ?').get(id);
    if (!product) {
      return notFoundError(`Product not found: ${id}`, '/api/admin/products/[productId]/quantity-per-carton');
    }

    // Update quantityPerCarton
    const now = new Date().toISOString();
    db.prepare('UPDATE Product SET quantityPerCarton = ?, updatedAt = ? WHERE id = ?')
      .run(quantityPerCarton || null, now, id);

    console.log(`✅ Updated quantity per carton for product ${id}: ${quantityPerCarton || '(cleared)'}`);

    return NextResponse.json({
      success: true,
      productId: id,
      quantityPerCarton: quantityPerCarton || null,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]/quantity-per-carton');
  }
}
