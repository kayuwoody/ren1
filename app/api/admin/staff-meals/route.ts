import { NextResponse } from 'next/server';
import { getSaleOrders, buildDateFilter, parseItemVariations } from '@/lib/db/orderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/staff-meals
 *
 * The flip side of the "hide staff meals" filter: reports ONLY the staff meals
 * (sale orders with total <= 0 — the 100% "Unicorns" discount). Shows the real
 * cost to the business (frozen COGS) and the retail value given up, broken down
 * by item and by day. Staff meals are POS-only, so online orders are ignored.
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    // All sale orders in range, then keep only the zero-total (staff meal) ones.
    const orders = getSaleOrders({
      branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals: false,
    }).filter(o => o.total <= 0);

    const productMap: Record<string, { name: string; quantity: number; cogs: number; retail: number }> = {};
    const dayMap: Record<string, { count: number; items: number; cogs: number; retail: number }> = {};
    let totalCOGS = 0;
    let totalRetail = 0;
    let totalItems = 0;

    const klDay = (iso: string) =>
      new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const order of orders) {
      let consumptions: any[] = [];
      try {
        consumptions = getOrderConsumptions(order.id);
      } catch {}

      const day = klDay(order.createdAt);
      dayMap[day] = dayMap[day] || { count: 0, items: 0, cogs: 0, retail: 0 };
      dayMap[day].count += 1;

      for (const item of order.items) {
        const v = parseItemVariations(item);
        const isBundle = v._is_bundle === 'true';
        const name = (isBundle && v._bundle_display_name) ? v._bundle_display_name : item.productName;
        const retail = (item.basePrice || item.finalPrice || 0) * item.quantity;

        const itemCons = consumptions.filter(c => String(c.orderItemId) === String(item.id));
        const itemCOGS = itemCons.reduce((s, c) => s + (c.totalCost || 0), 0);

        totalItems += item.quantity;
        totalRetail += retail;
        totalCOGS += itemCOGS;
        dayMap[day].items += item.quantity;
        dayMap[day].retail += retail;
        dayMap[day].cogs += itemCOGS;

        productMap[name] = productMap[name] || { name, quantity: 0, cogs: 0, retail: 0 };
        productMap[name].quantity += item.quantity;
        productMap[name].cogs += itemCOGS;
        productMap[name].retail += retail;
      }
    }

    const byProduct = Object.values(productMap).sort((a, b) => b.quantity - a.quantity);
    const byDay = Object.entries(dayMap)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      summary: {
        totalMeals: orders.length,
        totalItems,
        totalCOGS,
        totalRetail,
      },
      byProduct,
      byDay,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/staff-meals');
  }
}
