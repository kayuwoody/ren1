import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');

    // Calculate date range
    let startDate = new Date();
    let endDate = new Date();

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      // Calculate based on range
      switch (range) {
        case '7days':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90days':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case 'all':
          startDate = new Date('2020-01-01'); // Far back enough
          break;
      }
    }

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

    // Filter only completed and processing orders
    const orders = allOrders.filter(
      (order) => order.status === 'completed' || order.status === 'processing' || order.status === 'ready-for-pickup'
    );

    // Calculate statistics
    let totalRevenue = 0;
    let totalDiscounts = 0;
    const revenueByDay: Record<string, { revenue: number; orders: number; discounts: number }> = {};
    const productStats: Record<string, { quantity: number; revenue: number }> = {};
    const ordersByStatus: Record<string, number> = {};

    orders.forEach((order) => {
      // Get final total and discount from metadata
      const finalTotal = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_final_total')?.value || order.total
      );
      const discount = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_total_discount')?.value || '0'
      );

      totalRevenue += finalTotal;
      totalDiscounts += discount;

      // Group by day
      const orderDate = new Date(order.date_created).toISOString().split('T')[0];
      if (!revenueByDay[orderDate]) {
        revenueByDay[orderDate] = { revenue: 0, orders: 0, discounts: 0 };
      }
      revenueByDay[orderDate].revenue += finalTotal;
      revenueByDay[orderDate].orders += 1;
      revenueByDay[orderDate].discounts += discount;

      // Count by status
      ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;

      // Product stats
      order.line_items?.forEach((item: any) => {
        const finalPrice = parseFloat(
          item.meta_data?.find((m: any) => m.key === '_final_price')?.value || item.price
        );
        const itemRevenue = finalPrice * item.quantity;

        if (!productStats[item.name]) {
          productStats[item.name] = { quantity: 0, revenue: 0 };
        }
        productStats[item.name].quantity += item.quantity;
        productStats[item.name].revenue += itemRevenue;
      });
    });

    // Sort revenue by day
    const revenueByDayArray = Object.entries(revenueByDay)
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
        discounts: data.discounts,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Sort products by revenue
    const topProducts = Object.entries(productStats)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10); // Top 10 products

    // Orders by status
    const ordersByStatusArray = Object.entries(ordersByStatus).map(([status, count]) => ({
      status,
      count,
    }));

    const report = {
      totalRevenue,
      totalOrders: orders.length,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      totalDiscounts,
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
