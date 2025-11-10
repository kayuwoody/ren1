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

    // Update cart
    if (body.cart !== undefined) {
      currentCart = body.cart || [];

      // Broadcast update to all connected customer displays
      broadcastCartUpdate(currentCart, false);

      return NextResponse.json({ success: true });
    }

    // Set pending order (when checkout creates an order)
    if (body.setPendingOrder !== undefined) {
      if (body.setPendingOrder) {
        pendingOrder = {
          orderId: body.orderId,
          items: body.items || []
        };
        console.log(`📋 Set pending order: ${body.orderId} with ${body.items?.length || 0} items`);

        // Broadcast pending order to display
        broadcastCartUpdate(pendingOrder.items, true);
      } else {
        // Clear pending order (when payment is complete)
        console.log(`✅ Cleared pending order: ${pendingOrder?.orderId}`);
        pendingOrder = null;

        // Broadcast empty cart (payment complete)
        broadcastCartUpdate(currentCart, false);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
