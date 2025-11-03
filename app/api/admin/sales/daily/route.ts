import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';

export async function GET(req: Request) {
  console.log('🔧 [DEBUG] Daily sales API loaded - Code version: 2025-11-03-v2');
  try {
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date'); // Format: YYYY-MM-DD

    // Parse date as UTC+8 (Malaysia time)
    let year: number, month: number, day: number;

    if (dateParam) {
      // Parse the date string as YYYY-MM-DD
      const parts = dateParam.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1; // Month is 0-indexed
      day = parseInt(parts[2]);
    } else {
      // Get current date in UTC+8
      const now = new Date();
      const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
      year = utc8Time.getUTCFullYear();
      month = utc8Time.getUTCMonth();
      day = utc8Time.getUTCDate();
    }

    // Create start and end times in UTC, representing midnight to 23:59:59 in UTC+8
    // UTC+8 midnight = 16:00 previous day UTC
    // UTC+8 23:59:59 = 15:59:59 same day UTC
    const startUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - (8 * 60 * 60 * 1000));
    const endUTC = new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - (8 * 60 * 60 * 1000));

    const displayDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    console.log('📅 Daily sales report:', {
      targetDate: displayDate,
      startUTC: startUTC.toISOString(),
      endUTC: endUTC.toISOString(),
      startLocal: new Date(startUTC.getTime() + (8 * 60 * 60 * 1000)).toISOString(),
      endLocal: new Date(endUTC.getTime() + (8 * 60 * 60 * 1000)).toISOString(),
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

    console.log(`📦 Found ${orders.length} orders for ${displayDate}`);

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
      let consumptionCount = 0;
      try {
        const consumptions = getOrderConsumptions(String(order.id));
        consumptionCount = consumptions.length;
        orderCOGS = consumptions.reduce((sum, c) => sum + c.totalCost, 0);

        if (consumptions.length > 0) {
          console.log(`Order ${order.id}: Found ${consumptions.length} consumptions, COGS = RM ${orderCOGS.toFixed(2)}`);
        } else {
          console.log(`Order ${order.id}: No consumption records found (COGS = RM 0.00)`);
        }
      } catch (err) {
        console.error(`Order ${order.id}: Error fetching COGS:`, err);
      }

      const profit = finalTotal - orderCOGS;
      const margin = finalTotal > 0 ? (profit / finalTotal) * 100 : 0;

      // Process line items
      console.log(`Order ${order.id}: Processing ${order.line_items?.length || 0} line items`);
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

          console.log(`  🔍 Item "${item.name}" (ID: ${item.id}): Total consumptions for order = ${consumptions.length}`);

          // Debug: show all orderItemIds in consumption records
          const orderItemIds = consumptions.map(c => c.orderItemId).filter(Boolean);
          if (orderItemIds.length > 0) {
            console.log(`     OrderItemIds in consumptions: [${orderItemIds.join(', ')}]`);
          } else {
            console.log(`     ⚠️  No orderItemIds found in any consumption records!`);
          }

          const itemConsumptions = item.id
            ? consumptions.filter(c => Number(c.orderItemId) === Number(item.id))
            : [];
          itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

          if (itemConsumptions.length > 0) {
            console.log(`     ✅ Matched ${itemConsumptions.length} consumptions, COGS = RM ${itemCOGS.toFixed(2)}`);
          } else {
            console.log(`     ❌ No consumptions matched item.id="${item.id}"`);
          }
        } catch (err) {
          console.warn(`  Item "${item.name}": Error fetching COGS`, err);
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
        _debug: {
          consumptionCount,
          hasCOGS: orderCOGS > 0,
        },
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
      date: displayDate,
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
