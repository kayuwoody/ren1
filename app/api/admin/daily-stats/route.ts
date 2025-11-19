import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';

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
    // Get today's date in Malaysia time (UTC+8)
    const now = new Date();

    // Method 1: Calculate Malaysia time by offsetting from UTC
    // Malaysia is UTC+8, so we add 8 hours worth of milliseconds
    const malaysiaOffset = 8 * 60 * 60 * 1000;
    const malaysiaTime = new Date(now.getTime() + malaysiaOffset);

    // Extract date components from the Malaysia time
    const year = malaysiaTime.getUTCFullYear();
    const month = String(malaysiaTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(malaysiaTime.getUTCDate()).padStart(2, '0');
    const todayMalaysia = `${year}-${month}-${day}`;

    // Create start and end of day in Malaysia time (UTC+8)
    // Example: 2024-11-18T00:00:00+08:00 = 2024-11-17T16:00:00Z
    const startOfDay = new Date(`${todayMalaysia}T00:00:00+08:00`);
    const endOfDay = new Date(`${todayMalaysia}T23:59:59.999+08:00`);

    console.log('📅 Daily Stats Date Range:', {
      currentUTC: now.toISOString(),
      malaysiaDate: todayMalaysia,
      startOfDay: startOfDay.toISOString(),
      endOfDay: endOfDay.toISOString(),
      note: 'Querying WooCommerce for orders created between these UTC times'
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
