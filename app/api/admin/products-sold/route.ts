import { NextResponse } from 'next/server';
import { getSaleOrders, parseItemVariations } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

interface SaleDetail {
  orderId: number | string;
  orderNumber: string;
  date: string;
  quantity: number;
  price: number;
  cogs: number;
}

interface ProductData {
  name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
  avgPrice: number;
  avgCogs: number;
  avgProfit: number;
  discountTotal: number;
  sales: SaleDetail[];
}

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

    const productStats: Record<string, ProductData> = {};
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;
    let totalDiscounts = 0;

    for (const order of orders) {
      const orderDiscount = order.items.reduce(
        (s, it) => s + (it.discountApplied || 0) * it.quantity,
        0,
      );

      let orderConsumptions: any[] = [];
      try {
        orderConsumptions = getOrderConsumptions(order.id);
      } catch {}

      const orderSubtotal = order.items.reduce(
        (s, it) => s + it.finalPrice * it.quantity,
        0,
      ) || order.total;

      for (const item of order.items) {
        const v = parseItemVariations(item);
        const finalPrice = item.finalPrice;
        const itemRevenue = finalPrice * item.quantity;

        const itemConsumptions = orderConsumptions.filter(
          (c) => String(c.orderItemId) === String(item.id),
        );
        const itemCOGS = itemConsumptions.reduce((sum, c) => sum + c.totalCost, 0);

        const itemDiscountShare = orderSubtotal > 0
          ? (itemRevenue / orderSubtotal) * orderDiscount
          : 0;

        const isBundle = v._is_bundle === 'true';
        const bundleDisplayName = v._bundle_display_name;
        const productName = isBundle && bundleDisplayName ? bundleDisplayName : item.productName;

        if (!productStats[productName]) {
          productStats[productName] = {
            name: productName,
            quantity: 0,
            revenue: 0,
            cogs: 0,
            profit: 0,
            margin: 0,
            avgPrice: 0,
            avgCogs: 0,
            avgProfit: 0,
            discountTotal: 0,
            sales: [],
          };
        }

        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += itemRevenue - itemCOGS;
        productStats[productName].discountTotal += itemDiscountShare;

        productStats[productName].sales.push({
          orderId: order.wcId ?? order.id,
          orderNumber: order.orderNumber,
          date: order.createdAt,
          quantity: item.quantity,
          price: finalPrice,
          cogs: item.quantity > 0 ? itemCOGS / item.quantity : 0,
        });

        totalRevenue += itemRevenue;
        totalCOGS += itemCOGS;
        totalProfit += itemRevenue - itemCOGS;
        totalItemsSold += item.quantity;
        totalDiscounts += itemDiscountShare;
      }
    }

    const products = Object.values(productStats).map((p) => ({
      ...p,
      margin: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0,
      avgPrice: p.quantity > 0 ? p.revenue / p.quantity : 0,
      avgCogs: p.quantity > 0 ? p.cogs / p.quantity : 0,
      avgProfit: p.quantity > 0 ? p.profit / p.quantity : 0,
      sales: p.sales.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }));

    const allProducts = [...products].sort((a, b) => b.quantity - a.quantity);

    const topSelling = [...products].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const highestRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const highestProfit = [...products].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const bestMargin = [...products]
      .filter((p) => p.quantity >= 3)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
    const worstMargin = [...products]
      .filter((p) => p.quantity >= 3)
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 5);

    // Reconstruct displayable date range (mirrors orderService buildDateFilter)
    const now = new Date();
    const utc8Now = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const currentYear = utc8Now.getUTCFullYear();
    const currentMonth = utc8Now.getUTCMonth();
    const currentDay = utc8Now.getUTCDate();
    let rangeStart: Date;
    let rangeEnd = new Date(
      Date.UTC(currentYear, currentMonth, currentDay, 23, 59, 59, 999) - 8 * 60 * 60 * 1000,
    );
    if (startDateParam && endDateParam) {
      const sp = startDateParam.split('-');
      const ep = endDateParam.split('-');
      rangeStart = new Date(
        Date.UTC(parseInt(sp[0]), parseInt(sp[1]) - 1, parseInt(sp[2]), 0, 0, 0, 0) -
          8 * 60 * 60 * 1000,
      );
      rangeEnd = new Date(
        Date.UTC(parseInt(ep[0]), parseInt(ep[1]) - 1, parseInt(ep[2]), 23, 59, 59, 999) -
          8 * 60 * 60 * 1000,
      );
    } else {
      switch (range) {
        case '30days':
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, currentDay - 30, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
          break;
        case '90days':
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, currentDay - 90, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
          break;
        case 'mtd':
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
          break;
        case 'ytd':
          rangeStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000);
          break;
        case 'all':
          rangeStart = new Date('2020-01-01');
          break;
        case '7days':
        default:
          rangeStart = new Date(
            Date.UTC(currentYear, currentMonth, currentDay - 7, 0, 0, 0, 0) - 8 * 60 * 60 * 1000,
          );
      }
    }

    const report = {
      summary: {
        totalProducts: products.length,
        totalItemsSold,
        totalRevenue,
        totalCOGS,
        totalProfit,
        overallMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        totalDiscounts,
        avgPricePerItem: totalItemsSold > 0 ? totalRevenue / totalItemsSold : 0,
        avgProfitPerItem: totalItemsSold > 0 ? totalProfit / totalItemsSold : 0,
      },
      allProducts,
      highlights: {
        topSelling,
        highestRevenue,
        highestProfit,
        bestMargin,
        worstMargin,
      },
      dateRange: {
        start: rangeStart.toISOString(),
        end: rangeEnd.toISOString(),
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, '/api/admin/products-sold');
  }
}
