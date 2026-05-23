import { NextResponse } from 'next/server';
import { getSaleOrders, parseItemVariations, buildDateFilter } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { getCollectedOnlineOrders } from '@/lib/db/onlineOrderService';
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
    const source = searchParams.get('source') || 'all';

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    // Fetch POS orders and online orders in parallel
    const posOrders = source !== 'online'
      ? getSaleOrders({ branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals })
      : [];

    const onlineOrders = source !== 'pos'
      ? await getCollectedOnlineOrders({ startDate, endDate })
      : [];

    console.log(`📦 Sales report: ${posOrders.length} POS + ${onlineOrders.length} online orders`);

    // Calculate statistics
    let totalRevenue = 0;
    let totalDiscounts = 0;
    let totalVoucherDiscount = 0;
    let totalPassDiscount = 0;
    let totalCOGS = 0;
    let totalItemsSold = 0;
    let totalOrderCount = 0;
    const revenueByDay: Record<string, { revenue: number; orders: number; discounts: number; voucherDiscount: number; passDiscount: number; cogs: number; profit: number }> = {};
    const productStats: Record<string, { quantity: number; revenue: number; cogs: number; profit: number }> = {};
    const ordersByStatus: Record<string, number> = {};

    // Process POS orders
    for (const order of posOrders) {
      const finalTotal = order.total;
      const discount = order.items.reduce(
        (sum, it) => sum + (it.discountApplied || 0) * it.quantity,
        0,
      );

      let orderCOGS = 0;
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch (err) {
        console.warn(`⚠️  Could not fetch COGS for order ${order.id}`);
      }

      const orderVoucherDiscount = order.voucherDiscount || 0;
      const orderPassDiscount = order.passDiscount || 0;

      totalRevenue += finalTotal;
      totalDiscounts += discount;
      totalVoucherDiscount += orderVoucherDiscount;
      totalPassDiscount += orderPassDiscount;
      totalCOGS += orderCOGS;
      totalOrderCount++;

      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = { revenue: 0, orders: 0, discounts: 0, voucherDiscount: 0, passDiscount: 0, cogs: 0, profit: 0 };
      }
      revenueByDay[orderDate].revenue += finalTotal;
      revenueByDay[orderDate].orders += 1;
      revenueByDay[orderDate].discounts += discount;
      revenueByDay[orderDate].voucherDiscount += orderVoucherDiscount;
      revenueByDay[orderDate].passDiscount += orderPassDiscount;
      revenueByDay[orderDate].cogs += orderCOGS;
      revenueByDay[orderDate].profit += (finalTotal - orderCOGS);

      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;

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

        totalItemsSold += item.quantity;
      }
    }

    // Process online orders
    for (const order of onlineOrders) {
      const finalTotal = order.total;

      let orderCOGS = 0;
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch {}

      totalRevenue += finalTotal;
      totalCOGS += orderCOGS;
      totalOrderCount++;

      const orderDate = new Date(order.createdAt).toISOString().split('T')[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = { revenue: 0, orders: 0, discounts: 0, voucherDiscount: 0, passDiscount: 0, cogs: 0, profit: 0 };
      }
      revenueByDay[orderDate].revenue += finalTotal;
      revenueByDay[orderDate].orders += 1;
      revenueByDay[orderDate].cogs += orderCOGS;
      revenueByDay[orderDate].profit += (finalTotal - orderCOGS);

      ordersByStatus['collected'] = (ordersByStatus['collected'] || 0) + 1;

      for (const item of order.items) {
        const productName = item.productName;
        const itemRevenue = item.finalPrice * item.quantity;
        const itemConsumptions = orderConsumptions.filter(
          (c: any) => String(c.orderItemId) === String(item.id),
        );
        const itemCOGS = itemConsumptions.reduce((sum: number, c: any) => sum + c.totalCost, 0);

        if (!productStats[productName]) {
          productStats[productName] = { quantity: 0, revenue: 0, cogs: 0, profit: 0 };
        }
        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);

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
        voucherDiscount: data.voucherDiscount,
        passDiscount: data.passDiscount,
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

    const report = {
      totalRevenue,
      totalOrders: totalOrderCount,
      averageOrderValue: totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0,
      totalDiscounts,
      totalVoucherDiscount,
      totalPassDiscount,
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
