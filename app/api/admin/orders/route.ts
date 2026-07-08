import { NextResponse } from 'next/server';
import { getOrders, getOrderItems, toWcOrderShape } from '@/lib/db/orderService';
import { getAllOnlineOrders } from '@/lib/db/onlineOrderService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders
 *
 * Admin endpoint to fetch ALL orders for the management page — local POS orders
 * plus online orders (from Supabase), each tagged with `source` ('pos' |
 * 'online') so the page can filter by all/pos/online. Merged and sorted newest
 * first, in a WooCommerce-ish shape the page already consumes.
 *
 * Query params:
 * - branchId=all: show orders from all branches (POS only)
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const showAll = searchParams.get('branchId') === 'all';

    // POS orders (local SQLite)
    const baseOrders = getOrders({
      branchId: showAll ? undefined : branchId,
      showAll,
    });
    const posShaped = baseOrders
      .map((o) => ({ ...o, items: getOrderItems(o.id) }))
      .map(toWcOrderShape)
      .map((o) => ({ ...o, source: 'pos' as const }));

    // Online orders (Supabase) — normalise to the same shape
    let onlineShaped: any[] = [];
    try {
      const online = await getAllOnlineOrders();
      onlineShaped = online.map((o) => ({
        id: o.id,
        number: o.orderNumber,
        status: o.status,
        total: String(o.total ?? 0),
        date_created: o.createdAt,
        customer_id: 0,
        source: 'online' as const,
        billing: {
          first_name: o.customerName || 'Online Customer',
          last_name: '',
          email: '',
          phone: o.customerPhone || '',
        },
        line_items: o.items.map((it) => ({
          id: it.id,
          product_id: it.productId,
          name: it.productName,
          quantity: it.quantity,
          price: it.unitPrice,
          total: String((it.unitPrice || 0) * (it.quantity || 0)),
          meta_data: [],
        })),
        meta_data: [{ key: '_final_total', value: String(o.total ?? 0) }],
      }));
    } catch (err) {
      // Online orders are best-effort; POS orders still render if Supabase is down
      console.error('Failed to load online orders for management page:', err);
    }

    const merged = [...posShaped, ...onlineShaped].sort(
      (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime(),
    );

    return NextResponse.json(merged);
  } catch (error) {
    return handleApiError(error, '/api/admin/orders');
  }
}
