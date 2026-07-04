import { NextResponse } from 'next/server';
import { getSaleOrders, buildDateFilter } from '@/lib/db/orderService';
import { getCollectedOnlineOrders } from '@/lib/db/onlineOrderService';
import { getOrderConsumptions } from '@/lib/db/inventoryConsumptionService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/costs
 *
 * Cost of Goods Used — "what we used to generate the revenue."
 *
 * Sourced from the SAME sale orders the revenue reports use (POS sale-status
 * orders + collected online orders), so it reconciles with the sales reports.
 * COGS comes from each order's frozen InventoryConsumption records and is
 * bucketed by ORDER date, not by when the consumption row happened to be
 * written. This deliberately excludes consumption not tied to a real sale
 * (pre-launch test orders, held/cancelled orders, orphaned rows).
 *
 * Same date + staff-meal filters as the sales reports (staff meals = zero-total
 * "Unicorns" orders, already dropped by getSaleOrders when hideStaffMeals=true).
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');
    const hideStaffMeals = searchParams.get('hideStaffMeals') === 'true';

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    const posOrders = getSaleOrders({
      branchId, range, startDate: startDateParam, endDate: endDateParam, hideStaffMeals,
    });
    const onlineOrders = await getCollectedOnlineOrders({ startDate, endDate });

    const materialMap: Record<string, { name: string; unit: string; quantity: number; cost: number }> = {};
    const productMap: Record<string, { name: string; orders: Set<string>; cost: number }> = {};
    const dayMap: Record<string, number> = {};
    let totalCOGS = 0;

    const klDay = (iso: string) =>
      new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const processOrder = (orderId: string, orderDateIso: string) => {
      let consumptions: any[] = [];
      try {
        consumptions = getOrderConsumptions(orderId);
      } catch {}
      const day = klDay(orderDateIso);
      for (const c of consumptions) {
        const cost = c.totalCost || 0;
        if (cost <= 0) continue;
        totalCOGS += cost;
        dayMap[day] = (dayMap[day] || 0) + cost;

        if (c.itemType === 'material') {
          const key = c.materialId || c.materialName || 'unknown';
          materialMap[key] = materialMap[key] || { name: c.materialName || 'Unknown', unit: c.unit, quantity: 0, cost: 0 };
          materialMap[key].quantity += c.quantityConsumed || 0;
          materialMap[key].cost += cost;
        }

        const pid = c.productId || c.productName || 'unknown';
        productMap[pid] = productMap[pid] || { name: c.productName || 'Unknown', orders: new Set(), cost: 0 };
        productMap[pid].cost += cost;
        productMap[pid].orders.add(String(orderId));
      }
    };

    for (const o of posOrders) processOrder(String(o.id), o.createdAt);
    for (const o of onlineOrders) processOrder(String(o.id), o.createdAt);

    const byMaterial = Object.values(materialMap)
      .map(m => ({ ...m, share: totalCOGS > 0 ? (m.cost / totalCOGS) * 100 : 0 }))
      .sort((a, b) => b.cost - a.cost);

    const byProduct = Object.values(productMap)
      .map(p => ({ name: p.name, orders: p.orders.size, cost: p.cost, share: totalCOGS > 0 ? (p.cost / totalCOGS) * 100 : 0 }))
      .sort((a, b) => b.cost - a.cost);

    const byDay = Object.entries(dayMap)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      summary: { totalCOGS, materialCount: byMaterial.length, productCount: byProduct.length },
      byMaterial,
      byProduct,
      byDay,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/costs');
  }
}
