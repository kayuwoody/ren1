import { NextRequest, NextResponse } from 'next/server';
import {
  getAllStockMovements,
  getItemStockMovements,
  getItemsWithMovements,
  getMovementSummary,
  type MovementType,
  type ItemType,
} from '@/lib/db/stockMovementService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'list'; // 'list', 'items', 'summary', 'item-history'

    if (mode === 'items') {
      // Return list of items that have movements (for the item picker)
      const items = getItemsWithMovements();
      return NextResponse.json({ items });
    }

    if (mode === 'summary') {
      const startDate = searchParams.get('start') || undefined;
      const endDate = searchParams.get('end') || undefined;
      const summary = getMovementSummary(startDate, endDate);
      return NextResponse.json(summary);
    }

    if (mode === 'item-history') {
      const itemType = searchParams.get('itemType') as ItemType;
      const itemId = searchParams.get('itemId');

      if (!itemType || !itemId) {
        return NextResponse.json(
          { error: 'itemType and itemId are required for item-history mode' },
          { status: 400 }
        );
      }

      const startDate = searchParams.get('start') || undefined;
      const endDate = searchParams.get('end') || undefined;
      const movements = getItemStockMovements(itemType, itemId, startDate, endDate);
      return NextResponse.json({ movements });
    }

    // Default: list all movements with filters
    const startDate = searchParams.get('start') || undefined;
    const endDate = searchParams.get('end') || undefined;
    const movementType = searchParams.get('movementType') as MovementType | undefined;
    const itemType = searchParams.get('itemType') as ItemType | undefined;
    const searchQuery = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const result = getAllStockMovements({
      startDate,
      endDate,
      movementType: movementType || undefined,
      itemType: itemType || undefined,
      searchQuery,
      limit,
      offset,
    });

    const summary = getMovementSummary(startDate, endDate);

    return NextResponse.json({
      ...result,
      summary,
    });
  } catch (error: any) {
    console.error('Stock usage API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stock usage data', detail: error.message },
      { status: 500 }
    );
  }
}
