import { NextResponse } from 'next/server';
import { fetchAllWooPages } from '@/lib/api/woocommerce-helpers';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/admin/orders
 *
 * Admin endpoint to fetch ALL orders (not filtered by user)
 * Used by staff dashboard for order management
 *
 * Security: Should add admin authentication in production
 */
export async function GET(req: Request) {
  try {
    // TODO: Add admin authentication check here
    // const isAdmin = await checkAdminAuth(req);
    // if (!isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch all orders with expanded parameters (using pagination helper)
    const orders = await fetchAllWooPages('orders', {
      orderby: 'date',
      order: 'desc'
    });

    return NextResponse.json(orders);
  } catch (error) {
    return handleApiError(error, '/api/admin/orders');
  }
}
