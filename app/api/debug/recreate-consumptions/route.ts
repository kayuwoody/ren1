import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { recordProductSale } from '@/lib/db/inventoryConsumptionService';
import { handleApiError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

/**
 * POST /api/debug/recreate-consumptions
 *
 * Backfill COGS records for orders missing consumption data.
 * Pass { orderIds: [...] } to target specific orders,
 * or { backfillAll: true } to find and fix all orders with 0 COGS.
 */
export async function POST(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const body = await req.json();
    const { orderIds, backfillAll } = body;

    let targetOrderIds: string[] = [];

    if (backfillAll) {
      const ordersWithNoCOGS = db.prepare(`
        SELECT o.id FROM "Order" o
        WHERE o.status IN ('processing', 'completed', 'ready-for-pickup')
        AND NOT EXISTS (
          SELECT 1 FROM InventoryConsumption ic WHERE ic.orderId = o.id
        )
        ORDER BY o.createdAt DESC
      `).all() as Array<{ id: string }>;
      targetOrderIds = ordersWithNoCOGS.map(o => o.id);
      console.log(`🔍 Found ${targetOrderIds.length} orders missing consumption records`);
    } else if (Array.isArray(orderIds) && orderIds.length > 0) {
      targetOrderIds = orderIds;
    } else {
      return NextResponse.json({ error: 'Pass { backfillAll: true } or { orderIds: [...] }' }, { status: 400 });
    }

    if (targetOrderIds.length === 0) {
      return NextResponse.json({ success: true, message: 'No orders need backfilling', results: [] });
    }

    const results = [];

    for (const orderId of targetOrderIds) {
      console.log(`\n🔄 Recreating consumption records for order ${orderId}...`);

      const order = db.prepare('SELECT * FROM "Order" WHERE id = ?').get(orderId) as any;
      if (!order) {
        results.push({ orderId, success: false, error: 'Order not found' });
        continue;
      }

      const items = db.prepare('SELECT * FROM OrderItem WHERE orderId = ?').all(orderId) as any[];
      if (items.length === 0) {
        results.push({ orderId, success: false, error: 'No line items' });
        continue;
      }

      let totalCOGS = 0;
      let totalConsumptions = 0;

      for (const item of items) {
        let bundleSelection: any;
        if (item.variations) {
          try {
            const v = JSON.parse(item.variations);
            if (v._is_bundle === 'true') {
              const mandatoryJson = v._bundle_mandatory;
              const optionalJson = v._bundle_optional;
              bundleSelection = {
                selectedMandatory: mandatoryJson ? JSON.parse(mandatoryJson) : {},
                selectedOptional: optionalJson ? JSON.parse(optionalJson) : [],
              };
            }
          } catch {}
        }

        const consumptions = await recordProductSale({
          orderId: String(orderId),
          wcProductId: String(item.productId),
          productName: item.productName,
          quantitySold: item.quantity,
          orderItemId: String(item.id),
          bundleSelection,
          branchId,
        });

        const itemCOGS = consumptions.reduce((sum, c) => sum + c.totalCost, 0);
        totalCOGS += itemCOGS;
        totalConsumptions += consumptions.length;
      }

      // Update the Order row with correct COGS
      if (totalCOGS > 0) {
        const totalProfit = order.total - totalCOGS;
        const margin = order.total > 0 ? (totalProfit / order.total) * 100 : 0;
        db.prepare('UPDATE "Order" SET totalCost = ?, totalProfit = ?, overallMargin = ? WHERE id = ?')
          .run(totalCOGS, totalProfit, margin, orderId);
      }

      results.push({ orderId, orderNumber: order.orderNumber, success: true, consumptionsCreated: totalConsumptions, totalCOGS });
    }

    return NextResponse.json({ success: true, backfilled: results.length, results });
  } catch (error) {
    return handleApiError(error, '/api/debug/recreate-consumptions');
  }
}
