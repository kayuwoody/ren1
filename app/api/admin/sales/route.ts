import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');

    // Calculate date range
    let startDate = new Date();
    let endDate = new Date();

    // IMPORTANT: Use UTC methods to avoid timezone issues
    // Set endDate to end of day in UTC (23:59:59.999 UTC)
    endDate.setUTCHours(23, 59, 59, 999);

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      startDate.setUTCHours(0, 0, 0, 0); // Start of day in UTC
      endDate = new Date(endDateParam);
      endDate.setUTCHours(23, 59, 59, 999); // End of day in UTC
    } else {
      // Calculate based on range
      switch (range) {
        case '7days':
          startDate.setDate(startDate.getDate() - 7);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case '30days':
          startDate.setDate(startDate.getDate() - 30);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case '90days':
          startDate.setDate(startDate.getDate() - 90);
          startDate.setUTCHours(0, 0, 0, 0);
          break;
        case 'all':
          startDate = new Date('2020-01-01');
          break;
      }
    }

    console.log('📊 Sales report date range:', {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      range
    });

    // Fetch all orders (we'll need to paginate if there are many)
    const allOrders: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data } = await wcApi.get('orders', {
        per_page: 100,
        page,
        after: startDate.toISOString(),
        before: endDate.toISOString(),
      }) as { data: any[] };

      allOrders.push(...data);

      if (data.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    console.log(`📦 Fetched ${allOrders.length} total orders from WooCommerce`);

    // Filter only orders that count as sales (exclude pending payment)
    const orders = allOrders.filter(
      (order) => order.status === 'completed' || order.status === 'processing' || order.status === 'ready-for-pickup'
    );

    console.log(`✅ Filtered to ${orders.length} orders with sales status`);
    if (orders.length > 0) {
      console.log('Sample order statuses:', orders.slice(0, 5).map(o => ({ id: o.id, status: o.status, date: o.date_created })));
    }

    // Calculate statistics
    let totalRevenue = 0;
    let totalDiscounts = 0;
    let totalCOGS = 0;
    const revenueByDay: Record<string, { revenue: number; orders: number; discounts: number; cogs: number; profit: number }> = {};
    const productStats: Record<string, { quantity: number; revenue: number; cogs: number; profit: number }> = {};
    const ordersByStatus: Record<string, number> = {};

    console.log('💰 Processing orders for revenue calculation...');

    orders.forEach((order) => {
      // Get final total and discount from metadata
      const finalTotal = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_final_total')?.value || order.total
      );
      const discount = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_total_discount')?.value || '0'
      );

      // Get COGS from inventory consumption records (fetch once per order, reuse for items)
      let orderCOGS = 0;
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(String(order.id));
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch (err) {
        console.warn(`⚠️  Could not fetch COGS for order ${order.id}`);
      }

      // Debug logging for discount tracking
      if (discount > 0) {
        console.log(`Order #${order.id}: Discount = RM ${discount.toFixed(2)}, Final Total = RM ${finalTotal.toFixed(2)}, COGS = RM ${orderCOGS.toFixed(2)}`);
      }

      totalRevenue += finalTotal;
      totalDiscounts += discount;
      totalCOGS += orderCOGS;

      // Group by day
      const orderDate = new Date(order.date_created).toISOString().split('T')[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = { revenue: 0, orders: 0, discounts: 0, cogs: 0, profit: 0 };
      }
      revenueByDay[orderDate].revenue += finalTotal;
      revenueByDay[orderDate].orders += 1;
      revenueByDay[orderDate].discounts += discount;
      revenueByDay[orderDate].cogs += orderCOGS;
      revenueByDay[orderDate].profit += (finalTotal - orderCOGS);

      // Count by status
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;

      // Product stats
      order.line_items?.forEach((item: any) => {
        const finalPrice = parseFloat(
          item.meta_data?.find((m: any) => m.key === '_final_price')?.value || item.price
        );
        const itemRevenue = finalPrice * item.quantity;

        // Get COGS for this specific product from cached consumptions (no duplicate DB call)
        let itemCOGS = 0;
        try {
          // Reuse orderConsumptions from above - no need to fetch again!
          const itemConsumptions = item.id
            ? orderConsumptions.filter(c => Number(c.orderItemId) === Number(item.id))
            : orderConsumptions;
          itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
        } catch (err) {
          // COGS not available
        }

        // Use bundle display name if available for proper tracking of combinations
        const isBundle = item.meta_data?.find((m: any) => m.key === '_is_bundle')?.value === 'true';
        const bundleDisplayName = item.meta_data?.find((m: any) => m.key === '_bundle_display_name')?.value;
        const productName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

        if (!productStats[productName]) {
          productStats[productName] = { quantity: 0, revenue: 0, cogs: 0, profit: 0 };
        }
        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);
      });
    });

    // Sort revenue by day
    const revenueByDayArray = Object.entries(revenueByDay)
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
        discounts: data.discounts,
        cogs: data.cogs,
        profit: data.profit,
        margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Sort products by revenue
    const topProducts = Object.entries(productStats)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: data.revenue,
        cogs: data.cogs,
        profit: data.profit,
        margin: data.revenue > 0 ? (data.profit / data.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 products

    // Orders by status
    const ordersByStatusArray = Object.entries(ordersByStatus).map(([status, count]) => ({
      status,
      count,
    }));

    const totalProfit = totalRevenue - totalCOGS;
    const overallMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    console.log('📊 Sales Report Summary:', {
      totalOrders: orders.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalCOGS: totalCOGS.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      overallMargin: overallMargin.toFixed(1) + '%',
      totalDiscounts: totalDiscounts.toFixed(2),
      avgOrderValue: (orders.length > 0 ? totalRevenue / orders.length : 0).toFixed(2),
    });

    const report = {
      totalRevenue,
      totalOrders: orders.length,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      totalDiscounts,
      totalCOGS,
      totalProfit,
      overallMargin,
      revenueByDay: revenueByDayArray,
      topProducts,
      ordersByStatus: ordersByStatusArray,
    };

    return NextResponse.json(report);
  } catch (err: any) {
    console.error('❌ Sales report error:', err);
    return NextResponse.json(
      { error: 'Failed to generate sales report', detail: err.message },
      { status: 500 }
    );
  }
}
