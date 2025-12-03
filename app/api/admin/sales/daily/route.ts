import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

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

    // Fetch orders for the day (using pagination helper)
    const allOrders = await fetchAllWooPages('orders', {
      after: startUTC.toISOString(),
      before: endUTC.toISOString(),
      orderby: 'date',
      order: 'desc',
    });

    // Filter to completed/processing orders
    const orders = allOrders.filter(
      (order) => order.status === 'completed' || order.status === 'processing' || order.status === 'ready-for-pickup'
    );

    console.log(`📦 Found ${orders.length} orders for ${displayDate}`);

    // Process each order
    const detailedOrders = orders.map((order) => {
      const finalTotal = parseFloat(
        getMetaValue(order.meta_data, '_final_total', order.total)
      );
      const totalDiscount = parseFloat(
        getMetaValue(order.meta_data, '_total_discount', '0')
      );

      // Get COGS from consumption records (fetch once per order, reuse for items)
      let orderCOGS = 0;
      let consumptionCount = 0;
      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(String(order.id));
        consumptionCount = orderConsumptions.length;
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

        if (orderConsumptions.length > 0) {
          console.log(`Order ${order.id}: Found ${orderConsumptions.length} consumptions, COGS = RM ${orderCOGS.toFixed(2)}`);
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
          getMetaValue(item.meta_data, '_retail_price', item.price)
        );
        const finalPrice = parseFloat(
          getMetaValue(item.meta_data, '_final_price', item.price)
        );
        const discountReason = getMetaValue(item.meta_data, '_discount_reason');

        // Get item-specific COGS from cached consumptions (no duplicate DB call)
        let itemCOGS = 0;
        try {
          // Reuse orderConsumptions from above - no need to fetch again!
          console.log(`  🔍 Item "${item.name}" (ID: ${item.id}): Total consumptions for order = ${orderConsumptions.length}`);

          // Debug: show all orderItemIds in consumption records
          const orderItemIds = orderConsumptions.map(c => c.orderItemId).filter(Boolean);
          if (orderItemIds.length > 0) {
            console.log(`     OrderItemIds in consumptions: [${orderItemIds.join(', ')}]`);
          } else {
            console.log(`     ⚠️  No orderItemIds found in any consumption records!`);
          }

          const itemConsumptions = item.id
            ? orderConsumptions.filter(c => Number(c.orderItemId) === Number(item.id))
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

        // Check if this is a bundled product and use display name
        const isBundle = getMetaValue(item.meta_data, '_is_bundle') === 'true';
        const bundleDisplayName = getMetaValue(item.meta_data, '_bundle_display_name');
        const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

        // Get bundle components if available (stored at order creation time)
        let components: Array<{ productId: string; productName: string; quantity: number }> | undefined;
        if (isBundle) {
          const componentsJson = getMetaValue(item.meta_data, '_bundle_components');
          if (componentsJson) {
            try {
              components = JSON.parse(componentsJson);
            } catch (e) {
              console.warn(`  Failed to parse bundle components for item ${item.id}:`, e);
            }
          }
        }

        return {
          id: item.id,
          name: displayName,
          quantity: item.quantity,
          retailPrice,
          finalPrice,
          discountReason,
          itemTotal: itemRevenue,
          itemCOGS,
          itemProfit,
          itemMargin,
          isBundle,
          baseProductName: getMetaValue(item.meta_data, '_bundle_base_product_name'),
          components, // Include bundle components
        };
      }) || [];

      // Calculate retail total from actual item retail prices
      const retailTotal = items.reduce((sum, item) => sum + (item.retailPrice * item.quantity), 0);

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
    const summary: {
      totalOrders: number;
      totalRevenue: number;
      totalRetail: number;
      totalDiscounts: number;
      totalCOGS: number;
      totalProfit: number;
      overallMargin?: number;
    } = {
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
  } catch (error) {
    return handleApiError(error, '/api/admin/sales/daily');
  }
}
