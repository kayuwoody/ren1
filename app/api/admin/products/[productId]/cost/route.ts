import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProductCost } from '@/lib/db/productService';

/**
 * PUT /api/admin/products/[productId]/cost
 * Update product unit cost
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;
    const body = await request.json();
    const { unitCost } = body;

    if (typeof unitCost !== 'number' || unitCost < 0) {
      return NextResponse.json(
        { error: 'Invalid unit cost' },
        { status: 400 }
      );
    }

    const product = getProduct(productId);
    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Update the product with new unit cost
    updateProductCost(productId, unitCost);

    return NextResponse.json({
      success: true,
      message: 'Unit cost updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating product cost:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update product cost' },
      { status: 500 }
    );
  }
}
