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
let currentVoucher: any = null;
let pendingOrder: { orderId: string; items: any[]; voucher?: any } | null = null;

export async function GET() {
  if (pendingOrder && pendingOrder.items.length > 0) {
    return NextResponse.json({
      cart: pendingOrder.items,
      isPendingOrder: true,
      orderId: pendingOrder.orderId,
      voucher: pendingOrder.voucher || null,
    });
  }

  return NextResponse.json({
    cart: currentCart,
    isPendingOrder: false,
    voucher: currentVoucher,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    let cartUpdated = false;
    let pendingOrderUpdated = false;

    if (body.voucher !== undefined) {
      currentVoucher = body.voucher;
    }

    // Update cart
    if (body.cart !== undefined) {
      if (body.cart.length > 0 && pendingOrder !== null && body.setPendingOrder === undefined) {
        console.log(`🧹 Auto-clearing stale pending order (${pendingOrder.orderId}) due to new cart items`);

        broadcastCartUpdate([], false, null);
        console.log(`📺 Sent empty cart to reset display`);

        pendingOrder = null;
        pendingOrderUpdated = true;

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      currentCart = body.cart || [];
      if (body.cart.length === 0) {
        currentVoucher = null;
      }
      cartUpdated = true;
      console.log(`🛒 Updated cart with ${currentCart.length} items`);
    }

    // Set/clear pending order
    if (body.setPendingOrder !== undefined) {
      if (body.setPendingOrder) {
        pendingOrder = {
          orderId: body.orderId,
          items: body.items || [],
          voucher: body.voucher ?? currentVoucher,
        };
        console.log(`📋 Set pending order: ${body.orderId} with ${body.items?.length || 0} items`);

        broadcastCartUpdate(pendingOrder.items, true, pendingOrder.voucher);
        pendingOrderUpdated = true;
      } else {
        console.log(`✅ Cleared pending order: ${pendingOrder?.orderId}`);
        pendingOrder = null;
        currentVoucher = null;
        pendingOrderUpdated = true;
      }
    }

    if (cartUpdated && !pendingOrderUpdated) {
      broadcastCartUpdate(currentCart, false, currentVoucher);
    } else if (cartUpdated && pendingOrderUpdated && !body.setPendingOrder) {
      broadcastCartUpdate(currentCart, false, currentVoucher);
    }

    if (cartUpdated || pendingOrderUpdated) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
