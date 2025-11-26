import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';

// Force dynamic rendering to prevent caching - we need real-time stats
export const dynamic = 'force-dynamic';

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
    // Get current date in UTC+8 (Malaysia time)
    const now = new Date();
    const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const year = utc8Time.getUTCFullYear();
    const month = utc8Time.getUTCMonth();
    const day = utc8Time.getUTCDate();

    // Create start and end times in UTC, representing midnight to 23:59:59 in UTC+8
    // UTC+8 midnight = 16:00 previous day UTC
    // UTC+8 23:59:59 = 15:59:59 same day UTC
    const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
    const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

    const todayMalaysia = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    console.log('📅 Daily Stats Date Range:', {
      targetDate: todayMalaysia,
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
      startLocal: new Date(startOfDay.getTime() + (8 * 60 * 60 * 1000)).toISOString(),
      endLocal: new Date(endOfDay.getTime() + (8 * 60 * 60 * 1000)).toISOString(),
    });

    // Fetch ALL today's orders using pagination helper (not limited to 100)
    const todayOrders = await fetchAllWooPages('orders', {
      after: startOfDay.toISOString(),
      before: endOfDay.toISOString(),
    });

    // Fetch ALL pending orders (not limited to 100)
    const pendingOrders = await fetchAllWooPages('orders', {
      status: 'pending,processing,on-hold',
    });

    // Calculate stats
    let todayRevenue = 0;
    let itemsSold = 0;

    todayOrders.forEach((order: any) => {
      // Add to revenue (only completed/processing/ready-for-pickup orders)
      if (['completed', 'processing', 'ready-for-pickup'].includes(order.status)) {
        // Use _final_total from metadata if available (accounts for discounts)
        const finalTotal = parseFloat(
          getMetaValue(order.meta_data, '_final_total', order.total)
        );
        todayRevenue += finalTotal;

        // Count items only from paid orders
        if (order.line_items) {
          order.line_items.forEach((item: any) => {
            itemsSold += item.quantity || 0;
          });
        }
      }
    });

    console.log('📊 Daily Stats Results:', {
      totalOrdersFetched: todayOrders.length,
      paidOrders: todayOrders.filter((o: any) => ['completed', 'processing', 'ready-for-pickup'].includes(o.status)).length,
      todayRevenue,
      itemsSold,
      sampleOrders: todayOrders.slice(0, 3).map((o: any) => ({
        id: o.id,
        status: o.status,
        created: o.date_created,
        total: o.total
      }))
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
