import { NextResponse } from 'next/server';
import { getOrders, getOrderItems, toWcOrderShape } from '@/lib/db/orderService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders
 *
 * Admin endpoint to fetch ALL orders (not filtered by user) from local SQLite.
 *
 * Query params:
 * - branchId=all: show orders from all branches
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get('branchId') === 'all';

    const baseOrders = getOrders({
      branchId: showAll ? undefined : branchId,
      showAll,
    });

    const withItems = baseOrders.map((o) => ({ ...o, items: getOrderItems(o.id) }));
    const shaped = withItems.map(toWcOrderShape);

    return NextResponse.json(shaped);
  } catch (error) {
    return handleApiError(error, '/api/admin/orders');
  }
}
