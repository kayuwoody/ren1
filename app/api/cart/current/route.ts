import { NextResponse } from 'next/server';
import { broadcastCartUpdate } from '@/lib/sse/cartStreamManager';

/**
 * Current Cart API
 *
 * Simple in-memory cart storage for syncing between POS and customer display
 * Also tracks pending unpaid orders to keep them on customer display during checkout
 * In production, use Redis or similar for multi-instance deployments
 */

let currentCart: any[] = [];
let pendingOrder: { orderId: string; items: any[] } | null = null;

export async function GET() {
  // Return pending order items if they exist, otherwise return cart
  // This keeps the customer display populated during checkout/payment
  if (pendingOrder && pendingOrder.items.length > 0) {
    return NextResponse.json({
      cart: pendingOrder.items,
      isPendingOrder: true,
      orderId: pendingOrder.orderId
    });
  }

  return NextResponse.json({
    cart: currentCart,
    isPendingOrder: false
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    let cartUpdated = false;
    let pendingOrderUpdated = false;

    // Update cart
    if (body.cart !== undefined) {
      currentCart = body.cart || [];
      cartUpdated = true;
      console.log(`🛒 Updated cart with ${currentCart.length} items`);

      // IMPORTANT: If cart is being updated with new items (not empty),
      // clear any stale pending order to prevent display from showing old order
      if (currentCart.length > 0 && pendingOrder !== null && body.setPendingOrder === undefined) {
        console.log(`🧹 Auto-clearing stale pending order (${pendingOrder.orderId}) due to new cart items`);
        pendingOrder = null;
        pendingOrderUpdated = true;
      }
    }

    // Set/clear pending order
    if (body.setPendingOrder !== undefined) {
      if (body.setPendingOrder) {
        pendingOrder = {
          orderId: body.orderId,
          items: body.items || []
        };
        console.log(`📋 Set pending order: ${body.orderId} with ${body.items?.length || 0} items`);

        // Broadcast pending order to display
        broadcastCartUpdate(pendingOrder.items, true);
        pendingOrderUpdated = true;
      } else {
        // Clear pending order (when payment is complete)
        console.log(`✅ Cleared pending order: ${pendingOrder?.orderId}`);
        pendingOrder = null;
        pendingOrderUpdated = true;
      }
    }

    // Broadcast cart update if cart was updated and no pending order update occurred
    // (if pending order was updated, we already broadcast in the pending order logic)
    if (cartUpdated && !pendingOrderUpdated) {
      broadcastCartUpdate(currentCart, false);
    } else if (cartUpdated && pendingOrderUpdated && !body.setPendingOrder) {
      // Special case: both cart cleared and pending order cleared (payment complete)
      broadcastCartUpdate(currentCart, false);
    }

    if (cartUpdated || pendingOrderUpdated) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
