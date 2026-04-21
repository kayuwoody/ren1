import { NextResponse } from 'next/server';
import { getDayOrders, parseItemVariations } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    let year: number, month: number, day: number;
    if (dateParam) {
      const parts = dateParam.split('-');
      year = parseInt(parts[0]);
      month = parseInt(parts[1]) - 1;
      day = parseInt(parts[2]);
    } else {
      const now = new Date();
      const utc8Time = new Date(now.getTime() + (8 * 60 * 60 * 1000));
      year = utc8Time.getUTCFullYear();
      month = utc8Time.getUTCMonth();
      day = utc8Time.getUTCDate();
    }
    const displayDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const orders = getDayOrders({ branchId, date: dateParam || undefined });

    console.log(`📦 Found ${orders.length} local orders for ${displayDate}`);

    const detailedOrders = orders.map((order) => {
      const finalTotal = order.total;
      const totalDiscount = order.items.reduce((s, it) => s + (it.discountApplied || 0) * it.quantity, 0);

      let orderCOGS = 0;
      let orderConsumptions: any[] = [];
      let consumptionCount = 0;
      try {
        orderConsumptions = getOrderConsumptions(order.id);
        consumptionCount = orderConsumptions.length;
        orderCOGS = orderConsumptions.reduce((sum, c) => sum + c.totalCost, 0);
      } catch (err) {
        console.error(`Order ${order.id}: Error fetching COGS:`, err);
      }

      const profit = finalTotal - orderCOGS;
      const margin = finalTotal > 0 ? (profit / finalTotal) * 100 : 0;

      const items = order.items.map((item) => {
        const v = parseItemVariations(item);
        const retailPrice = item.basePrice || item.finalPrice;
        const finalPrice = item.finalPrice;
        const discountReason = v._discount_reason;

        const itemConsumptions = orderConsumptions.filter(
          (c) => String(c.orderItemId) === String(item.id),
        );
        const itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

        const itemRevenue = finalPrice * item.quantity;
        const itemProfit = itemRevenue - itemCOGS;
        const itemMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

        const isBundle = v._is_bundle === 'true';
        const bundleDisplayName = v._bundle_display_name;
        const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.productName;

        let components: Array<{ productId: string; productName: string; quantity: number }> | undefined;
        if (isBundle && v._bundle_components) {
          try {
            components = typeof v._bundle_components === 'string'
              ? JSON.parse(v._bundle_components)
              : v._bundle_components;
          } catch (e) {
            console.warn(`Failed to parse bundle components for item ${item.id}:`, e);
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
          baseProductName: v._bundle_base_product_name,
          components,
        };
      });

      const retailTotal = items.reduce((sum, it) => sum + it.retailPrice * it.quantity, 0);

      return {
        id: order.wcId ?? order.id,
        orderNumber: order.orderNumber,
        dateCreated: order.createdAt,
        status: order.status,
        customerName: order.customerName || 'Guest',
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
    summary.overallMargin = summary.totalRevenue > 0
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
