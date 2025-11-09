import { NextRequest, NextResponse } from 'next/server';
import { getBundleDirectComponentsByWcId } from '@/lib/db/bundleExpansionService';

/**
 * POST /api/bundles/expand
 *
 * Returns the DIRECT components of a bundle for customer-facing display.
 * Does NOT recurse into nested products - only shows the immediate linked products.
 *
 * Example: "Wake up Wonder" → ["Americano", "Danish"]
 * (stops there, doesn't show coffee beans, flour, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const { wcProductId, bundleSelection, quantity } = await request.json();

    if (!wcProductId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    // Get only direct components (depth 1) for display
    const components = getBundleDirectComponentsByWcId(
      wcProductId,
      bundleSelection,
      quantity || 1
    );

    console.log(`📦 Bundle expansion for WC ID ${wcProductId}: ${components.length} direct components`);
    components.forEach(c => {
      console.log(`   → ${c.productName} × ${c.quantity}`);
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
