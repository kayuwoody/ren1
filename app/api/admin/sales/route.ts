import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    // Calculate date range
    // Get current time in GMT+8 (Malaysia timezone)
    const now = new Date();
    const utc8Now = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const currentYear = utc8Now.getUTCFullYear();
    const currentMonth = utc8Now.getUTCMonth();
    const currentDay = utc8Now.getUTCDate();

    let startDate = new Date();
    let endDate = new Date();

    // Set endDate to end of current day in GMT+8 (converted to UTC)
    // GMT+8 23:59:59 = UTC 15:59:59 same day
    endDate = new Date(Date.UTC(currentYear, currentMonth, currentDay, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

    if (startDateParam && endDateParam) {
      // Custom date range - parse as GMT+8 dates
      const startParts = startDateParam.split('-');
      const endParts = endDateParam.split('-');

      startDate = new Date(Date.UTC(
        parseInt(startParts[0]),
        parseInt(startParts[1]) - 1,
        parseInt(startParts[2]),
        0, 0, 0, 0
      ) - (8 * 60 * 60 * 1000));

      endDate = new Date(Date.UTC(
        parseInt(endParts[0]),
        parseInt(endParts[1]) - 1,
        parseInt(endParts[2]),
        23, 59, 59, 999
      ) - (8 * 60 * 60 * 1000));
    } else {
      // Calculate based on range
      switch (range) {
        case '7days':
          // Start from 7 days ago at midnight GMT+8
          startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 7, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case '30days':
          // Start from 30 days ago at midnight GMT+8
          startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 30, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case '90days':
          // Start from 90 days ago at midnight GMT+8
          startDate = new Date(Date.UTC(currentYear, currentMonth, currentDay - 90, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case 'mtd':
          // Month to date - start of current month in GMT+8
          // First day of current month at midnight GMT+8, converted to UTC
          startDate = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
          break;
        case 'ytd':
          // Year to date - start of current year in GMT+8
          // January 1st of current year at midnight GMT+8, converted to UTC
          startDate = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
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

    // Fetch all orders (using pagination helper)
    const allOrders = await fetchAllWooPages('orders', {
      after: startDate.toISOString(),
      before: endDate.toISOString(),
    });

    console.log(`📦 Fetched ${allOrders.length} total orders from WooCommerce`);

    // Filter only orders that count as sales (exclude pending payment)
    let orders = allOrders.filter(
      (order) => order.status === 'completed' || order.status === 'processing' || order.status === 'ready-for-pickup'
    );

    // Filter out staff meals (orders with total = 0) if requested
    if (hideStaffMeals) {
      orders = orders.filter((order) => {
        const finalTotal = parseFloat(
          getMetaValue(order.meta_data, '_final_total', order.total)
        );
        return finalTotal > 0;
      });
      console.log(`🍽️  Filtered out staff meals (total=0), ${orders.length} orders remaining`);
    }

    console.log(`✅ Filtered to ${orders.length} orders with sales status`);
    if (orders.length > 0) {
      console.log('Sample order statuses:', orders.slice(0, 5).map(o => ({ id: o.id, status: o.status, date: o.date_created })));
    }

    // Calculate statistics
    let totalRevenue = 0;
    let totalDiscounts = 0;
    let totalCOGS = 0;
    let totalItemsSold = 0;
    const revenueByDay: Record<string, { revenue: number; orders: number; discounts: number; cogs: number; profit: number }> = {};
    const productStats: Record<string, { quantity: number; revenue: number; cogs: number; profit: number }> = {};
    const ordersByStatus: Record<string, number> = {};

    console.log('💰 Processing orders for revenue calculation...');

    orders.forEach((order) => {
      // Get final total and discount from metadata
      const finalTotal = parseFloat(
        getMetaValue(order.meta_data, '_final_total', order.total)
      );
      const discount = parseFloat(
        getMetaValue(order.meta_data, '_total_discount', '0')
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
          getMetaValue(item.meta_data, '_final_price', item.price)
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
        const isBundle = getMetaValue(item.meta_data, '_is_bundle') === 'true';
        const bundleDisplayName = getMetaValue(item.meta_data, '_bundle_display_name');
        const productName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

        if (!productStats[productName]) {
          productStats[productName] = { quantity: 0, revenue: 0, cogs: 0, profit: 0 };
        }
        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);

        // Track total items sold for average calculations
        totalItemsSold += item.quantity;
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
    const averageItemPrice = totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0;
    const averageProfitPerItem = totalItemsSold > 0 ? totalProfit / totalItemsSold : 0;

    console.log('📊 Sales Report Summary:', {
      totalOrders: orders.length,
      totalRevenue: totalRevenue.toFixed(2),
      totalCOGS: totalCOGS.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      overallMargin: overallMargin.toFixed(1) + '%',
      totalDiscounts: totalDiscounts.toFixed(2),
      avgOrderValue: (orders.length > 0 ? totalRevenue / orders.length : 0).toFixed(2),
      totalItemsSold,
      averageItemPrice: averageItemPrice.toFixed(2),
      averageProfitPerItem: averageProfitPerItem.toFixed(2),
    });

    const report = {
      totalRevenue,
      totalOrders: orders.length,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      totalDiscounts,
      totalCOGS,
      totalProfit,
      overallMargin,
      totalItemsSold,
      averageItemPrice,
      averageProfitPerItem,
      revenueByDay: revenueByDayArray,
      topProducts,
      ordersByStatus: ordersByStatusArray,
    };

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, '/api/admin/sales');
  }
}
