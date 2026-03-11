import { NextResponse } from 'next/server';
import { getSaleOrders } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

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
  sales: { orderId: string; orderNumber: string; date: string; quantity: number; price: number; cogs: number }[];
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
      for (const item of order.items) {
        const itemRevenue = item.finalPrice * item.quantity;
        const itemCOGS = item.totalCost;
        const productName = item.productName;

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

        const itemDiscountShare = item.discountApplied * item.quantity;

        productStats[productName].quantity += item.quantity;
        productStats[productName].revenue += itemRevenue;
        productStats[productName].cogs += itemCOGS;
        productStats[productName].profit += (itemRevenue - itemCOGS);
        productStats[productName].discountTotal += itemDiscountShare;

        productStats[productName].sales.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          date: order.createdAt,
          quantity: item.quantity,
          price: item.finalPrice,
          cogs: item.quantity > 0 ? itemCOGS / item.quantity : 0,
        });

        totalRevenue += itemRevenue;
        totalCOGS += itemCOGS;
        totalProfit += (itemRevenue - itemCOGS);
        totalItemsSold += item.quantity;
        totalDiscounts += itemDiscountShare;
      }
    }

    const products = Object.values(productStats).map(p => ({
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
    const bestMargin = [...products].filter(p => p.quantity >= 3).sort((a, b) => b.margin - a.margin).slice(0, 5);
    const worstMargin = [...products].filter(p => p.quantity >= 3).sort((a, b) => a.margin - b.margin).slice(0, 5);

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
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error, '/api/admin/products-sold');
  }
}
