import { NextResponse } from 'next/server';
import { recordProductSale, calculateProductCOGS } from '@/lib/db/inventoryConsumptionService';

/**
 * POST /api/orders/consumption
 * Record inventory consumption for an order
 */
export async function POST(req: Request) {
  try {
    const { orderId, lineItems } = await req.json();

    if (!orderId || !Array.isArray(lineItems)) {
      return NextResponse.json(
        { error: 'Invalid request - orderId and lineItems required' },
        { status: 400 }
      );
    }

    const results = [];
    let totalCOGS = 0;

    // Process each line item
    for (const item of lineItems) {
      const { productId, productName, quantity, orderItemId } = item;

      if (!productId || !quantity) {
        console.warn(`⚠️  Skipping invalid line item:`, item);
        continue;
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
        orderItemId
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
  } catch (error: any) {
    console.error('❌ Error recording inventory consumption:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record inventory consumption' },
      { status: 500 }
    );
  }
}
