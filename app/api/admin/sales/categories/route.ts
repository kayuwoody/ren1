import { NextResponse } from 'next/server';
import { getSaleOrders, buildDateFilter } from '@/lib/db/orderService';
import { getCollectedOnlineOrders } from '@/lib/db/onlineOrderService';
import { getProduct } from '@/lib/db/productService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

interface CategoryStat {
  category: string;
  quantity: number;
  revenue: number;
}

/**
 * Category breakdown: items sold and revenue per product category, with each
 * category's share of the totals. Each sold line counts under its own product's
 * category (a combo counts once under "combo"; components are not exploded).
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '30days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';
    const hideShellStaff = searchParams.get('hideShellStaff') === 'true';
    const source = searchParams.get('source') || 'all';

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    const posOrders = source !== 'online'
      ? getSaleOrders({ branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals, hideShellStaff })
      : [];

    const onlineOrders = source !== 'pos'
      ? await getCollectedOnlineOrders({ startDate, endDate })
      : [];

    const stats: Record<string, CategoryStat> = {};
    let totalItems = 0;
    let totalRevenue = 0;

    const add = (category: string, quantity: number, revenue: number) => {
      const key = category || 'Uncategorized';
      if (!stats[key]) stats[key] = { category: key, quantity: 0, revenue: 0 };
      stats[key].quantity += quantity;
      stats[key].revenue += revenue;
      totalItems += quantity;
      totalRevenue += revenue;
    };

    // POS orders — OrderItem carries its own category; fall back to the product.
    for (const order of posOrders) {
      for (const item of order.items) {
        const category = item.category || getProduct(item.productId)?.category || 'Uncategorized';
        add(category, item.quantity, item.finalPrice * item.quantity);
      }
    }

    // Online orders — resolve category from the product catalog.
    for (const order of onlineOrders) {
      for (const item of order.items) {
        const category = getProduct(item.productId)?.category || 'Uncategorized';
        add(category, item.quantity, item.finalPrice * item.quantity);
      }
    }

    const categories = Object.values(stats)
      .map((c) => ({
        ...c,
        pctItems: totalItems > 0 ? (c.quantity / totalItems) * 100 : 0,
        pctRevenue: totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    return NextResponse.json({
      categories,
      totals: { items: totalItems, revenue: totalRevenue, categories: categories.length },
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/sales/categories');
  }
}
