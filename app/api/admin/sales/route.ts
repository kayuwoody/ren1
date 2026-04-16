import { NextResponse } from 'next/server';
import { getSaleOrders, parseItemVariations } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    console.log('📊 Sales report date range:', {
      range,
      startDateParam,
      endDateParam,
    });

    // Query orders from local SQLite (offline-safe)
    const orders = getSaleOrders({
      branchId,
      range,
      startDate: startDateParam,
      endDate: endDateParam,
      hideStaffMeals,
    });

    console.log(`📦 Fetched ${orders.length} orders from local DB`);
    if (hideStaffMeals) {
      console.log(`🍽️  Staff meals filtered (total=0), ${orders.length} orders remaining`);
    }
    if (orders.length > 0) {
      console.log('Sample order statuses:', orders.slice(0, 5).map(o => ({ id: o.id, status: o.status, date: o.createdAt })));
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

    for (const order of orders) {
      const finalTotal = order.total;
      // Sum per-item discount (discountApplied is per-unit difference between retail and final price)
      const discount = order.items.reduce(
        (sum, it) => sum + (it.discountApplied || 0) * it.quantity,
        0,
      );

      // Get COGS from inventory consumption records (fetch once per order, reuse for items)
      let orderCOGS = 0;
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch (err) {
        console.warn(`⚠️  Could not fetch COGS for order ${order.id}`);
      }

      if (discount > 0) {
        console.log(`Order #${order.id}: Discount = RM ${discount.toFixed(2)}, Final Total = RM ${finalTotal.toFixed(2)}, COGS = RM ${orderCOGS.toFixed(2)}`);
      }

      totalRevenue += finalTotal;
      totalDiscounts += discount;
      totalCOGS += orderCOGS;

      // Group by day
      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
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
      for (const item of order.items) {
        const v = parseItemVariations(item);
        const isBundle = v._is_bundle === 'true';
        const productName = isBundle && v._bundle_display_name ? v._bundle_display_name : item.productName;

        const itemRevenue = item.finalPrice * item.quantity;
        const itemConsumptions = orderConsumptions.filter(
          (c) => String(c.orderItemId) === String(item.id),
        );
        const itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

        if (!productStats[productName]) {
          productStats[productName] = { quantity: 0, revenue: 0, cogs: 0, profit: 0 };
        }
        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);

        // Track total items sold for average calculations
        totalItemsSold += item.quantity;
      }
    }

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
