import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { recordProductSale } from '@/lib/db/inventoryConsumptionService';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export async function POST(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { orderIds } = await req.json();

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return validationError('orderIds array is required', '/api/debug/recreate-consumptions');
    }

    const results = [];

    for (const orderId of orderIds) {
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

      results.push({ orderId, success: true, consumptionsCreated: totalConsumptions, totalCOGS });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return handleApiError(error, '/api/debug/recreate-consumptions');
  }
}
