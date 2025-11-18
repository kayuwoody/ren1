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
    // Malaysia is 8 hours ahead of UTC
    const now = new Date();

    // Get current time in Malaysia by using toLocaleString with Asia/Kuala_Lumpur timezone
    const malaysiaTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' });
    const malaysiaTime = new Date(malaysiaTimeStr);

    // Get the date string in Malaysia timezone (YYYY-MM-DD)
    const year = malaysiaTime.getFullYear();
    const month = String(malaysiaTime.getMonth() + 1).padStart(2, '0');
    const day = String(malaysiaTime.getDate()).padStart(2, '0');
    const todayMalaysia = `${year}-${month}-${day}`;

    // Create start and end of day in Malaysia time (UTC+8)
    // Example: 2024-11-18T00:00:00+08:00 = 2024-11-17T16:00:00Z
    const startOfDay = new Date(`${todayMalaysia}T00:00:00+08:00`);
    const endOfDay = new Date(`${todayMalaysia}T23:59:59.999+08:00`);

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
        // Use _final_total from metadata if available (accounts for discounts)
        const finalTotal = order.meta_data?.find((m: any) => m.key === '_final_total')?.value;
        todayRevenue += parseFloat(finalTotal || order.total || '0');

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
