import { NextResponse } from "next/server";
import { createWooOrder } from "@/lib/orderService";
import { getPaymentInfo } from "@/lib/paymentService";
import { getPosCustomerId } from "@/lib/posCustomer";
import { getBranchIdFromRequest } from "@/lib/api/branchHelper";

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
    const branchId = getBranchIdFromRequest(req);
    const body = await req.json();
    let { line_items, userId, guestId, billing, shipping, meta_data } = body;

    // Tag order with branchId in meta_data
    meta_data = [
      ...(Array.isArray(meta_data) ? meta_data : []),
      { key: '_branch_id', value: branchId },
    ];

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

    console.log(`✅ Order created: #${order.id} (pending payment)`);

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
