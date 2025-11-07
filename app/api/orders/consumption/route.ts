import { NextResponse } from 'next/server';
import { recordProductSale, calculateProductCOGS } from '@/lib/db/inventoryConsumptionService';
import { handleApiError, validationError } from '@/lib/api/error-handler';

/**
 * POST /api/orders/consumption
 * Record inventory consumption for an order
 */
export async function POST(req: Request) {
  try {
    const { orderId, lineItems } = await req.json();

    if (!orderId || !Array.isArray(lineItems)) {
      return validationError('orderId and lineItems required', '/api/orders/consumption');
    }

    const results = [];
    let totalCOGS = 0;

    // Process each line item
    for (const item of lineItems) {
      const { productId, productName, quantity, orderItemId, meta_data } = item;

      console.log(`📦 Processing line item:`, {
        productId,
        productName,
        quantity,
        orderItemId: orderItemId || '(null)',
        orderItemIdType: typeof orderItemId,
      });

      if (!productId || !quantity) {
        console.warn(`⚠️  Skipping invalid line item:`, item);
        continue;
      }

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
            console.log(`   🎁 Bundle selection:`, bundleSelection);
          } catch (e) {
            console.warn(`   ⚠️  Failed to parse bundle metadata`);
          }
        }
      }

      // Calculate COGS for this item
      const cogsData = calculateProductCOGS(productId, quantity);
      totalCOGS += cogsData.totalCOGS;

      // Record material consumption and deduct from stock
      const consumptions = recordProductSale(
        orderId,
        productId,
        productName,
        quantity,
        orderItemId,
        bundleSelection
      );

      results.push({
        productId,
        productName,
        quantity,
        cogs: cogsData.totalCOGS,
        consumptions: consumptions.length,
        breakdown: cogsData.breakdown,
      });
    }

    console.log(`✅ Processed inventory consumption for order ${orderId}: RM ${totalCOGS.toFixed(2)} COGS`);

    return NextResponse.json({
      success: true,
      orderId,
      totalCOGS,
      results,
    });
  } catch (error) {
    return handleApiError(error, '/api/orders/consumption');
  }
}
