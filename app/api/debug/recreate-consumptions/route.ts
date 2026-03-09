import { NextResponse } from 'next/server';
import { wcApi } from '@/lib/wooClient';
import { recordProductSale } from '@/lib/db/inventoryConsumptionService';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

/**
 * POST /api/debug/recreate-consumptions
 * Recreate consumption records for specific orders
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

      // Fetch order from WooCommerce
      const { data: order } = await wcApi.get(`orders/${orderId}`) as { data: any };

      if (!order || !order.line_items) {
        console.warn(`⚠️  Order ${orderId} not found or has no line items`);
        results.push({
          orderId,
          success: false,
          error: 'Order not found or has no line items',
        });
        continue;
      }

      console.log(`📦 Order ${orderId}: ${order.line_items.length} line items`);

      let totalCOGS = 0;
      let totalConsumptions = 0;

      // Process each line item
      for (const item of order.line_items) {
        const { product_id, name, quantity, id: orderItemId, meta_data } = item;

        console.log(`  Processing: ${name} (qty: ${quantity}, orderItemId: ${orderItemId})`);

        // Extract bundle metadata if present
        let bundleSelection: { selectedMandatory: Record<string, string>, selectedOptional: string[] } | undefined;
        if (meta_data) {
          const isBundle = meta_data.find((m: any) => m.key === '_is_bundle')?.value === 'true';
          if (isBundle) {
            const mandatoryJson = meta_data.find((m: any) => m.key === '_bundle_mandatory')?.value;
            const optionalJson = meta_data.find((m: any) => m.key === '_bundle_optional')?.value;

            try {
              bundleSelection = {
                selectedMandatory: mandatoryJson ? JSON.parse(mandatoryJson) : {},
                selectedOptional: optionalJson ? JSON.parse(optionalJson) : [],
              };
            } catch (e) {
              console.warn(`   ⚠️  Failed to parse bundle metadata`);
            }
          }
        }

        // Record consumption
        const consumptions = await recordProductSale({
          orderId: String(orderId),
          wcProductId: String(product_id),
          productName: name,
          quantitySold: quantity,
          orderItemId: String(orderItemId),
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
