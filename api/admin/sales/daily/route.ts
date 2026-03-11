import { NextResponse } from 'next/server';
import { getDayOrders } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');

    // Parse date for display
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

    // Process each order into the detailed format the frontend expects
    const detailedOrders = orders.map((order) => {
      const finalTotal = order.total;
      const orderCOGS = order.totalCost;
      const profit = order.totalProfit;
      const margin = finalTotal > 0 ? (profit / finalTotal) * 100 : 0;

      const items = order.items.map((item) => {
        const itemRevenue = item.finalPrice * item.quantity;
        const itemCOGS = item.totalCost;
        const itemProfit = itemRevenue - itemCOGS;
        const itemMargin = itemRevenue > 0 ? (itemProfit / itemRevenue) * 100 : 0;

        // Parse variations JSON for bundle info
        let isBundle = false;
        let baseProductName: string | undefined;
        let components: any[] | undefined;
        let discountReason: string | undefined;
        let retailPrice = item.basePrice;

        if (item.variations) {
          try {
            const v = JSON.parse(item.variations);
            isBundle = v._is_bundle === 'true';
            baseProductName = v._bundle_base_product_name;
            discountReason = v._discount_reason;
            if (v._retail_price) retailPrice = parseFloat(v._retail_price);
            if (v._bundle_components) {
              try { components = JSON.parse(v._bundle_components); } catch {}
            }
          } catch {}
        }

        return {
          id: item.id,
          name: item.productName,
          quantity: item.quantity,
          retailPrice,
          finalPrice: item.finalPrice,
          discountReason,
          itemTotal: itemRevenue,
          itemCOGS,
          itemProfit,
          itemMargin,
          isBundle,
          baseProductName,
          components,
        };
      });

      const retailTotal = items.reduce((sum, item) => sum + (item.retailPrice * item.quantity), 0);
      const totalDiscount = items.reduce((sum, item) => sum + ((item.retailPrice - item.finalPrice) * item.quantity), 0);

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        dateCreated: order.createdAt,
        status: order.status,
        customerName: order.customerName || 'Guest',
        items,
        retailTotal,
        finalTotal,
        totalDiscount: totalDiscount > 0 ? totalDiscount : 0,
        orderCOGS,
        profit,
        margin,
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
