import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { buildDateFilter } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/costs
 *
 * Cost of Goods Used — aggregates the frozen point-of-sale COGS from
 * InventoryConsumption over a date range. Same date + staff-meal filters as the
 * sales reports. "What we used to generate the revenue."
 *
 * Staff meals (100% "Unicorns" discount → order total 0) are excluded when
 * hideStaffMeals=true, matching the profit card: we drop consumption tied to a
 * zero-total local order. Online-order consumption (orderId not in the local
 * Order table) and normal POS orders are kept.
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

    const staffFilter = hideStaffMeals
      ? `AND orderId NOT IN (SELECT id FROM "Order" WHERE total <= 0)`
      : '';

    const params = [startDate, endDate, branchId];

    const totalRow = db.prepare(`
      SELECT COALESCE(SUM(totalCost), 0) AS cost
      FROM InventoryConsumption
      WHERE consumedAt >= ? AND consumedAt <= ?
        AND (branchId = ? OR branchId IS NULL)
        ${staffFilter}
    `).get(...params) as { cost: number };
    const totalCOGS = totalRow.cost;

    // By ingredient / material — what was physically used
    const byMaterial = db.prepare(`
      SELECT COALESCE(materialName, 'Unknown') AS name, unit,
             SUM(quantityConsumed) AS quantity, SUM(totalCost) AS cost
      FROM InventoryConsumption
      WHERE consumedAt >= ? AND consumedAt <= ?
        AND (branchId = ? OR branchId IS NULL)
        AND itemType = 'material'
        ${staffFilter}
      GROUP BY COALESCE(materialId, materialName), unit
      HAVING SUM(totalCost) > 0
      ORDER BY cost DESC
    `).all(...params) as Array<{ name: string; unit: string; quantity: number; cost: number }>;

    // By menu item — which products cost the most to make
    const byProduct = db.prepare(`
      SELECT COALESCE(productName, 'Unknown') AS name,
             COUNT(DISTINCT orderId) AS orders,
             SUM(totalCost) AS cost
      FROM InventoryConsumption
      WHERE consumedAt >= ? AND consumedAt <= ?
        AND (branchId = ? OR branchId IS NULL)
        ${staffFilter}
      GROUP BY productId
      HAVING SUM(totalCost) > 0
      ORDER BY cost DESC
    `).all(...params) as Array<{ name: string; orders: number; cost: number }>;

    // By day (KL calendar day) — cost trend
    const byDay = db.prepare(`
      SELECT date(consumedAt, '+8 hours') AS date, SUM(totalCost) AS cost
      FROM InventoryConsumption
      WHERE consumedAt >= ? AND consumedAt <= ?
        AND (branchId = ? OR branchId IS NULL)
        ${staffFilter}
      GROUP BY date(consumedAt, '+8 hours')
      HAVING SUM(totalCost) > 0
      ORDER BY date DESC
    `).all(...params) as Array<{ date: string; cost: number }>;

    return NextResponse.json({
      summary: {
        totalCOGS,
        materialCount: byMaterial.length,
        productCount: byProduct.length,
      },
      byMaterial: byMaterial.map(m => ({ ...m, share: totalCOGS > 0 ? (m.cost / totalCOGS) * 100 : 0 })),
      byProduct: byProduct.map(p => ({ ...p, share: totalCOGS > 0 ? (p.cost / totalCOGS) * 100 : 0 })),
      byDay,
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/costs');
  }
}
