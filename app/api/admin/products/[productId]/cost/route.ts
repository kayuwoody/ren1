import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';

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

    if (typeof supplierCost !== 'number' || supplierCost < 0) {
      return NextResponse.json(
        { error: 'Invalid supplierCost. Must be a non-negative number.' },
        { status: 400 }
      );
    }

    // Update product supplierCost
    const stmt = db.prepare(`
      UPDATE Product
      SET supplierCost = ?, updatedAt = datetime('now')
      WHERE id = ?
    `);

    const result = stmt.run(supplierCost, productId);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Get updated product
    const product = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId);

    console.log(`✅ Updated product ${productId} supplierCost to RM ${supplierCost.toFixed(2)}`);

    return NextResponse.json({
      success: true,
      product,
    });
  } catch (error: any) {
    console.error('Error updating product cost:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update product cost' },
      { status: 500 }
    );
  }
}
