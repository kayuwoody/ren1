import { NextResponse } from 'next/server';
import { getSaleOrders } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    const orders = getSaleOrders({
      branchId,
      range,
      startDate: startDateParam,
      endDate: endDateParam,
      hideStaffMeals,
    });

    // Calculate statistics (same response shape as before)
    let totalRevenue = 0;
    let totalDiscounts = 0;
    let totalCOGS = 0;
    let totalItemsSold = 0;
    const revenueByDay: Record<string, { revenue: number; orders: number; discounts: number; cogs: number; profit: number }> = {};
    const productStats: Record<string, { quantity: number; revenue: number; cogs: number; profit: number }> = {};
    const ordersByStatus: Record<string, number> = {};

    for (const order of orders) {
      const finalTotal = order.total;
      const orderCOGS = order.totalCost;

      totalRevenue += finalTotal;
      totalCOGS += orderCOGS;

      const orderDate = order.createdAt.split('T')[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = { revenue: 0, orders: 0, discounts: 0, cogs: 0, profit: 0 };
      }
      revenueByDay[orderDate].revenue += finalTotal;
      revenueByDay[orderDate].orders += 1;
      revenueByDay[orderDate].cogs += orderCOGS;
      revenueByDay[orderDate].profit += (finalTotal - orderCOGS);

      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;

      for (const item of order.items) {
        const itemRevenue = item.finalPrice * item.quantity;
        const itemCOGS = item.totalCost;
        const productName = item.productName;

        if (!productStats[productName]) {
          productStats[productName] = { quantity: 0, revenue: 0, cogs: 0, profit: 0 };
        }
        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);

        totalItemsSold += item.quantity;
        totalDiscounts += item.discountApplied * item.quantity;
      }
    }

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
      .slice(0, 10);

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
