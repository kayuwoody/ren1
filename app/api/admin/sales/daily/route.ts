import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD

    // Default to today in UTC+8 (Malaysia time)
    let targetDate: Date;
    if (dateParam) {
      targetDate = new Date(dateParam);
    } else {
      // Get current time in UTC+8
      const now = new Date();
      const utc8Offset = 8 * 60; // 8 hours in minutes
      const utc8Time = new Date(now.getTime() + (utc8Offset * 60 * 1000));
      targetDate = utc8Time;
    }

    // Set to start of day (00:00:00) in UTC+8
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    // Set to end of day (23:59:59.999) in UTC+8
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Convert to UTC for API query
    const startUTC = new Date(startOfDay.getTime() - (8 * 60 * 60 * 1000));
    const endUTC = new Date(endOfDay.getTime() - (8 * 60 * 60 * 1000));

    console.log('📅 Daily sales report:', {
      targetDate: targetDate.toISOString().split('T')[0],
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString(),
    });

    // Fetch orders for the day
    const allOrders: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data } = await wcApi.get('orders', {
        per_page: 100,
        page,
        after: startUTC.toISOString(),
        before: endUTC.toISOString(),
        orderby: 'date',
        order: 'desc',
      }) as { data: any[] };

      allOrders.push(...data);

      if (data.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    // Filter to completed/processing orders
    const orders = allOrders.filter(
      (order) => order.status === 'completed' || order.status === 'processing' || order.status === 'ready-for-pickup'
    );

    console.log(`📦 Found ${orders.length} orders for ${targetDate.toISOString().split('T')[0]}`);

    // Process each order
    const detailedOrders = orders.map((order) => {
      const finalTotal = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_final_total')?.value || order.total
      );
      const retailTotal = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_retail_total')?.value || order.total
      );
      const totalDiscount = parseFloat(
        order.meta_data?.find((m: any) => m.key === '_total_discount')?.value || '0'
      );

      // Get COGS from consumption records
      let orderCOGS = 0;
      try {
        const consumptions = getOrderConsumptions(String(order.id));
        orderCOGS = consumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch (err) {
        // COGS not available
      }

      const profit = finalTotal - orderCOGS;
      const margin = finalTotal > 0 ? (profit / finalTotal) * 100 : 0;

      // Process line items
      const items = order.line_items?.map((item: any) => {
        const retailPrice = parseFloat(
          item.meta_data?.find((m: any) => m.key === '_retail_price')?.value || item.price
        );
        const finalPrice = parseFloat(
          item.meta_data?.find((m: any) => m.key === '_final_price')?.value || item.price
        );
        const discountReason = item.meta_data?.find((m: any) => m.key === '_discount_reason')?.value;

        // Get item-specific COGS
        let itemCOGS = 0;
        try {
          const consumptions = getOrderConsumptions(String(order.id));
          const itemConsumptions = item.id
            ? consumptions.filter(c => c.orderItemId === String(item.id))
            : [];
          itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
        } catch (err) {
          // COGS not available
        }

        const itemRevenue = finalPrice * item.quantity;
        const itemProfit = itemRevenue - itemCOGS;
        const itemMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

        return {
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          retailPrice,
          finalPrice,
          discountReason,
          itemTotal: itemRevenue,
          itemCOGS,
          itemProfit,
          itemMargin,
        };
      }) || [];

      return {
        id: order.id,
        orderNumber: order.number,
        dateCreated: order.date_created,
        status: order.status,
        customerName: order.billing?.first_name || order.billing?.email || 'Guest',
        items,
        retailTotal,
        finalTotal,
        totalDiscount,
        orderCOGS,
        profit,
        margin,
      };
    });

    // Calculate totals
    const summary = {
      totalOrders: detailedOrders.length,
      totalRevenue: detailedOrders.reduce((sum, o) => sum + o.finalTotal, 0),
      totalRetail: detailedOrders.reduce((sum, o) => sum + o.retailTotal, 0),
      totalDiscounts: detailedOrders.reduce((sum, o) => sum + o.totalDiscount, 0),
      totalCOGS: detailedOrders.reduce((sum, o) => sum + o.orderCOGS, 0),
      totalProfit: detailedOrders.reduce((sum, o) => sum + o.profit, 0),
    };

    summary['overallMargin'] = summary.totalRevenue > 0
      ? (summary.totalProfit / summary.totalRevenue) * 100
      : 0;

    return NextResponse.json({
      date: targetDate.toISOString().split('T')[0],
      summary,
      orders: detailedOrders,
    });
  } catch (err: any) {
    console.error('❌ Daily sales report error:', err);
    return NextResponse.json(
      { error: 'Failed to generate daily sales report', detail: err.message },
      { status: 500 }
    );
  }
}
