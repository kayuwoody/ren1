import { NextResponse } from 'next/server';
import { recordProductSale } from '@/lib/db/inventoryConsumptionService';
import { getOrderWithItems } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError, validationError } from '@/lib/api/error-handler';

/**
 * POST /api/debug/recreate-consumptions
 * Recreate consumption records for specific orders (from local SQLite)
 */
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

      const order = getOrderWithItems(String(orderId));

      if (!order || !order.items.length) {
        console.warn(`⚠️  Order ${orderId} not found or has no line items`);
        results.push({
          orderId,
          success: false,
          error: 'Order not found or has no line items',
        });
        continue;
      }

      console.log(`📦 Order ${orderId}: ${order.items.length} line items`);

      let totalCOGS = 0;
      let totalConsumptions = 0;

      for (const item of order.items) {
        console.log(`  Processing: ${item.productName} (qty: ${item.quantity}, orderItemId: ${item.id})`);

        // Extract bundle selection from variations JSON
        let bundleSelection: { selectedMandatory: Record<string, string>, selectedOptional: string[] } | undefined;
        if (item.variations) {
          try {
            const v = JSON.parse(item.variations);
            if (v._is_bundle === 'true') {
              bundleSelection = {
                selectedMandatory: v._bundle_mandatory ? JSON.parse(v._bundle_mandatory) : {},
                selectedOptional: v._bundle_optional ? JSON.parse(v._bundle_optional) : [],
              };
            }
          } catch {}
        }

        const consumptions = await recordProductSale({
          orderId: String(orderId),
          wcProductId: item.productId,
          productName: item.productName,
          quantitySold: item.quantity,
          orderItemId: item.id,
          bundleSelection,
          branchId,
        });

        const itemCOGS = consumptions.reduce((sum, c) => sum + c.totalCost, 0);
        totalCOGS += itemCOGS;
        totalConsumptions += consumptions.length;

        console.log(`    ✅ Created ${consumptions.length} consumption records, COGS = RM ${itemCOGS.toFixed(2)}`);
      }

      results.push({
        orderId,
        success: true,
        consumptionsCreated: totalConsumptions,
        totalCOGS,
      });

      console.log(`✅ Order ${orderId}: Created ${totalConsumptions} consumption records, Total COGS = RM ${totalCOGS.toFixed(2)}`);
    }

    return NextResponse.json({
      success: true,
      results,
    });

  } catch (error) {
    return handleApiError(error, '/api/debug/recreate-consumptions');
  }
}
