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
    const utc8Offset = 8 * 60; // 8 hours in minutes
    const utc8Time = new Date(now.getTime() + (utc8Offset * 60 * 1000));

    // Create start of day (00:00:00) in UTC+8
    const today = new Date(utc8Time);
    today.setUTCHours(0, 0, 0, 0);

    // Create end of day (23:59:59.999) in UTC+8
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    // Fetch today's orders
    const { data: todayOrders } = await wcApi.get('orders', {
      after: today.toISOString(),
      before: tomorrow.toISOString(),
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
