import { NextResponse } from "next/server";
import { createWooOrder } from "@/lib/orderService";
import { getPaymentInfo } from "@/lib/paymentService";
import { getPosCustomerId } from "@/lib/posCustomer";

/**
 * POST /api/orders/create-with-payment
 *
 * Creates a WooCommerce order and returns payment URL
 * Use this when customer is ready to pay
 *
 * Body params:
 * - line_items: Array of products to order
 * - userId: Customer ID (optional)
 * - guestId: Guest session ID (optional)
 * - billing: Billing details (optional)
 *
 * Returns:
 * - order: WooCommerce order object
 * - payment: Payment info (URL, status, total)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { line_items, userId, guestId, billing, shipping, meta_data } = body;

    // Validation
    if (!line_items || !Array.isArray(line_items) || line_items.length === 0) {
      return NextResponse.json(
        { error: "line_items is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    // Auto-assign POS customer for walk-in orders
    // Detect by billing email or "Walk-in Customer" name
    const isWalkInOrder =
      billing?.first_name === "Walk-in Customer" ||
      billing?.email === "pos@coffee-oasis.com.my";

    if (isWalkInOrder && !userId) {
      try {
        userId = await getPosCustomerId();
        console.log(`🏪 Walk-in order assigned to POS customer #${userId}`);
      } catch (err) {
        console.error('⚠️ Could not assign POS customer:', err);
        // Continue without userId - will create as guest order
      }
    }

    // Create order in WooCommerce with 'pending' status (awaiting payment)
    const order = await createWooOrder({
      line_items,
      userId,
      guestId,
      status: "pending", // Awaiting payment
      billing,
      shipping,
      meta_data,
    });

    console.log(`✅ Order created: #${order.id}`);

    // IMMEDIATELY update local SQLite inventory to match WooCommerce's auto-deduction
    // WooCommerce automatically decrements stock when order is created, so SQLite must do the same
    // This ensures SQLite (source of truth) stays in sync with WooCommerce
    try {
      const consumptionPayload = {
        orderId: order.id.toString(),
        lineItems: order.line_items.map((item: any) => ({
          productId: item.product_id,
          productName: item.name,
          quantity: item.quantity,
          orderItemId: item.id,
          meta_data: item.meta_data,
        })),
      };

      const consumptionResponse = await fetch(`${new URL(req.url).origin}/api/orders/consumption`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(consumptionPayload),
      });

      if (!consumptionResponse.ok) {
        console.error(`⚠️ Failed to record inventory consumption for order ${order.id}:`, await consumptionResponse.text());
      } else {
        console.log(`✅ SQLite inventory updated for order #${order.id}`);
      }
    } catch (consumptionErr) {
      console.error(`❌ Error calling consumption API for order ${order.id}:`, consumptionErr);
      // Don't fail the order if consumption recording fails - order is already created in WooCommerce
    }

    // Extract payment information
    const payment = getPaymentInfo(order);

    // Check if payment URL exists
    if (!payment.paymentURL) {
      console.warn("⚠️ Order created but no payment URL available:", order.id);
      return NextResponse.json(
        {
          error: "Payment URL not available. Check WooCommerce payment gateway settings.",
          order,
        },
        { status: 500 }
      );
    }

    console.log(`💳 Payment URL ready: ${payment.paymentURL}`);

    return NextResponse.json({
      success: true,
      order,
      payment,
    });
  } catch (error: any) {
    console.error("❌ Create order with payment error:", error);
    return NextResponse.json(
      {
        error: "Failed to create order",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
