import { NextRequest, NextResponse } from 'next/server';
import { expandBundleByWcId } from '@/lib/db/bundleExpansionService';

export async function POST(request: NextRequest) {
  try {
    const { wcProductId, bundleSelection, quantity } = await request.json();

    if (!wcProductId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const components = expandBundleByWcId(
      wcProductId,
      bundleSelection,
      quantity || 1
    );

    return NextResponse.json({ components });
  } catch (error) {
    console.error('Error expanding bundle:', error);
    return NextResponse.json(
      { error: 'Failed to expand bundle' },
      { status: 500 }
    );
  }
}
