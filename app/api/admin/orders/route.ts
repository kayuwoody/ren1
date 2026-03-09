import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders
 *
 * Admin endpoint to fetch ALL orders (not filtered by user)
 * Used by staff dashboard for order management
 *
 * Query params:
 * - branchId=all: show orders from all branches
 *
 * Security: Should add admin authentication in production
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get('branchId') === 'all';

    // TODO: Add admin authentication check here
    // const isAdmin = await checkAdminAuth(req);
    // if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all orders with expanded parameters (using pagination helper)
    // Explicitly exclude trash status - only show active orders
    let orders = await fetchAllWooPages('orders', {
      status: 'any',  // 'any' means all statuses EXCEPT trash
      orderby: 'date',
      order: 'desc',
      _: Date.now()  // Cache buster to ensure fresh data
    });

    // Filter by branch if not showing all
    if (!showAll) {
      orders = orders.filter((order) => {
        const orderBranchId = getMetaValue(order.meta_data, '_branch_id', '');
        // Include orders with no branch tag (legacy) or matching branch
        return !orderBranchId || orderBranchId === branchId;
      });
    }

    return NextResponse.json(orders);
  } catch (error) {
    return handleApiError(error, '/api/admin/orders');
  }
}
