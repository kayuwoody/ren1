import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';

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
    // Get today's date range in Malaysia time (UTC+8)
    const now = new Date();

    // Convert to Malaysia time by adding 8 hours
    const malaysiaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));

    // Get the date string in Malaysia timezone (YYYY-MM-DD)
    const year = malaysiaTime.getUTCFullYear();
    const month = String(malaysiaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(malaysiaTime.getUTCDate()).padStart(2, '0');
    const todayMalaysia = `${year}-${month}-${day}`;

    // Create start of day in Malaysia time, then convert to UTC for API
    // Malaysia 00:00:00 = UTC 16:00:00 (previous day)
    const startOfDay = new Date(`${todayMalaysia}T00:00:00+08:00`);
    const endOfDay = new Date(`${todayMalaysia}T23:59:59+08:00`);

    console.log('Daily Stats Date Range:', {
      malaysiaDate: todayMalaysia,
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString()
    });

    // Fetch today's orders
    const { data: todayOrders } = await wcApi.get('orders', {
      after: startOfDay.toISOString(),
      before: endOfDay.toISOString(),
      per_page: 100
    }) as { data: any[] };

    // Fetch pending orders (any date)
    const { data: pendingOrders } = await wcApi.get('orders', {
      status: 'pending,processing,on-hold',
      per_page: 100
    }) as { data: any[] };

    // Calculate stats
    let todayRevenue = 0;
    let itemsSold = 0;

    todayOrders.forEach((order: any) => {
      // Add to revenue (only completed/processing orders)
      if (['completed', 'processing'].includes(order.status)) {
        todayRevenue += parseFloat(order.total || '0');

        // Count items only from paid orders
        if (order.line_items) {
          order.line_items.forEach((item: any) => {
            itemsSold += item.quantity || 0;
          });
        }
      }
    });

    console.log('Daily Stats Results:', {
      totalOrdersFetched: todayOrders.length,
      paidOrders: todayOrders.filter((o: any) => ['completed', 'processing'].includes(o.status)).length,
      todayRevenue,
      itemsSold
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
