import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError, notFoundError } from '@/lib/api/error-handler';

/**
 * PATCH /api/admin/products/[productId]/supplier
 * Update product supplier
 */
export async function PATCH(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId: id } = params;
    const body = await req.json();
    const { supplier } = body;

    // Validate supplier (allow null/empty to clear)
    if (supplier !== null && supplier !== undefined && typeof supplier !== 'string') {
      return validationError('Supplier must be a string or null', '/api/admin/products/[productId]/supplier');
    }

    // Check if product exists
    const product = db.prepare('SELECT id, name FROM Product WHERE id = ?').get(id);
    if (!product) {
      return notFoundError(`Product not found: ${id}`, '/api/admin/products/[productId]/supplier');
    }

    // Update supplier
    const now = new Date().toISOString();
    db.prepare('UPDATE Product SET supplier = ?, updatedAt = ? WHERE id = ?')
      .run(supplier || null, now, id);

    console.log(`✅ Updated supplier for product ${id}: "${supplier || '(cleared)'}"`);

    return NextResponse.json({
      success: true,
      productId: id,
      supplier: supplier || null,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]/supplier');
  }
}
