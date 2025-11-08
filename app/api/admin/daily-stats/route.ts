import { NextResponse } from 'next/server';
import { fetchWooOrders } from '@/lib/woocommerce';

/**
 * Admin Daily Stats API
 *
 * Returns today's operational statistics:
 * - Total orders today
 * - Total revenue today
 * - Items sold today
 * - Pending orders
 */

export async function GET() {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Fetch today's orders
    const todayOrders = await fetchWooOrders({
      after: today.toISOString(),
      before: tomorrow.toISOString(),
      per_page: 100
    });

    // Fetch pending orders (any date)
    const pendingOrders = await fetchWooOrders({
      status: 'pending,processing,on-hold',
      per_page: 100
    });

    // Calculate stats
    let todayRevenue = 0;
    let itemsSold = 0;

    todayOrders.forEach((order: any) => {
      // Add to revenue (only completed/processing orders)
      if (['completed', 'processing'].includes(order.status)) {
        todayRevenue += parseFloat(order.total || '0');
      }

      // Count items
      if (order.line_items) {
        order.line_items.forEach((item: any) => {
          itemsSold += item.quantity || 0;
        });
      }
    });

    return NextResponse.json({
      todayOrders: todayOrders.length,
      todayRevenue,
      itemsSold,
      pendingOrders: pendingOrders.length
    });

  } catch (error) {
    console.error('Failed to fetch daily stats:', error);

    // Return zeros on error instead of failing
    return NextResponse.json({
      todayOrders: 0,
      todayRevenue: 0,
      itemsSold: 0,
      pendingOrders: 0
    });
  }
}
