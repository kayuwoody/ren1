import { NextRequest, NextResponse } from 'next/server';
import { getProductByWcId } from '@/lib/db/productService';
import { getSelectedComponents } from '@/lib/db/recursiveProductExpansion';

/**
 * POST /api/bundles/expand
 *
 * Returns the DIRECT components of a bundle for customer-facing display based on user selections.
 * Does NOT show raw materials - only the selected product components.
 *
 * Example: "Wake up Wonder" with selections → ["Blueberry Danish", "Hot Americano"]
 */
export async function POST(request: NextRequest) {
  try {
    const { wcProductId, bundleSelection, quantity } = await request.json();

    if (!wcProductId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    // Find product by WC ID
    const product = getProductByWcId(wcProductId);
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Get selected components based on user's choices
    const components = getSelectedComponents(
      product.id,
      bundleSelection,
      quantity || 1
    );

    console.log(`📦 Bundle expansion for ${product.name}: ${components.length} components`);
    components.forEach(c => {
      console.log(`   → ${c.productName} × ${c.quantity} | Category: ${c.category}`);
    });

    return NextResponse.json({ components });
  } catch (error) {
    console.error('Error expanding bundle:', error);
    return NextResponse.json(
      { error: 'Failed to expand bundle' },
      { status: 500 }
    );
  }
}
