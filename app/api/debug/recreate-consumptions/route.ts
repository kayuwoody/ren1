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
 * Pass { force: true } to delete existing consumption records and re-run.
 */
export async function POST(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const body = await req.json();
    const { orderIds, backfillAll, force } = body;

    let targetOrderIds: string[] = [];

    if (backfillAll) {
      let query: string;
      if (force) {
        // Force mode: re-run ALL orders (clears and recreates consumption records)
        query = `
          SELECT o.id FROM "Order" o
          WHERE o.status IN ('processing', 'completed', 'ready-for-pickup')
          ORDER BY o.createdAt DESC
        `;
      } else {
        // Normal mode: only orders missing consumption records
        query = `
          SELECT o.id FROM "Order" o
          WHERE o.status IN ('processing', 'completed', 'ready-for-pickup')
          AND NOT EXISTS (
            SELECT 1 FROM InventoryConsumption ic WHERE ic.orderId = o.id
          )
          ORDER BY o.createdAt DESC
        `;
      }
      const rows = db.prepare(query).all() as Array<{ id: string }>;
      targetOrderIds = rows.map(o => o.id);
      console.log(`🔍 Found ${targetOrderIds.length} orders to ${force ? 'reprocess' : 'backfill'}`);
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

      // Delete existing consumption records if force mode or if re-running specific orders
      if (force || Array.isArray(orderIds)) {
        const deleted = db.prepare('DELETE FROM InventoryConsumption WHERE orderId = ?').run(orderId);
        if (deleted.changes > 0) {
          console.log(`   🗑️ Deleted ${deleted.changes} existing consumption records`);
        }
      } else {
        const existing = db.prepare('SELECT COUNT(*) as c FROM InventoryConsumption WHERE orderId = ?').get(orderId) as { c: number };
        if (existing.c > 0) {
          console.log(`   ⏭️ Order already has ${existing.c} consumption records (pass force:true to re-run)`);
          results.push({ orderId, orderNumber: order.orderNumber, success: true, skipped: true, existingRecords: existing.c });
          continue;
        }
      }

      const items = db.prepare('SELECT * FROM OrderItem WHERE orderId = ?').all(orderId) as any[];
      if (items.length === 0) {
        results.push({ orderId, success: false, error: 'No line items' });
        continue;
      }

      let totalCOGS = 0;
      let totalConsumptions = 0;
      let missingSelections = false;

      for (const item of items) {
        let bundleSelection: any;
        if (item.variations) {
          try {
            const v = JSON.parse(item.variations);
            if (v._is_bundle === 'true') {
              const mandatoryJson = v._bundle_mandatory;
              const optionalJson = v._bundle_optional;
              if (mandatoryJson || optionalJson) {
                bundleSelection = {
                  selectedMandatory: mandatoryJson ? JSON.parse(mandatoryJson) : {},
                  selectedOptional: optionalJson ? JSON.parse(optionalJson) : [],
                };
              } else {
                // Old order without selection data — pass empty selections.
                // This records mandatory base items (e.g., Nasi Lemak Bungkus)
                // but skips XOR items (drinks, danishes) since we don't know which was selected.
                bundleSelection = { selectedMandatory: {}, selectedOptional: [] };
                missingSelections = true;
                console.log(`   ⚠️ Bundle "${item.productName}" missing selection data — recording base items only`);
              }
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

      // Always update Order row from actual consumption total
      const totalProfit = order.total - totalCOGS;
      const margin = order.total > 0 ? (totalProfit / order.total) * 100 : 0;
      db.prepare('UPDATE "Order" SET totalCost = ?, totalProfit = ?, overallMargin = ? WHERE id = ?')
        .run(totalCOGS, totalProfit, margin, orderId);

      // Also update OrderItem costs
      for (const item of items) {
        const itemConsumptions = db.prepare(
          'SELECT SUM(totalCost) as total FROM InventoryConsumption WHERE orderId = ? AND orderItemId = ?'
        ).get(orderId, item.id) as { total: number | null };
        const itemCOGS = itemConsumptions?.total || 0;
        const itemProfit = item.subtotal - itemCOGS;
        const itemMargin = item.subtotal > 0 ? (itemProfit / item.subtotal) * 100 : 0;
        db.prepare('UPDATE OrderItem SET unitCost = ?, totalCost = ?, itemProfit = ?, itemMargin = ? WHERE id = ?')
          .run(itemCOGS / (item.quantity || 1), itemCOGS, itemProfit, itemMargin, item.id);
      }

      results.push({
        orderId,
        orderNumber: order.orderNumber,
        success: true,
        consumptionsCreated: totalConsumptions,
        totalCOGS,
        missingSelections,
        note: missingSelections ? 'Bundle selection data missing — COGS only includes base items, not selected drinks/options' : undefined,
      });
    }

    return NextResponse.json({ success: true, backfilled: results.length, results });
  } catch (error) {
    return handleApiError(error, '/api/debug/recreate-consumptions');
  }
}
