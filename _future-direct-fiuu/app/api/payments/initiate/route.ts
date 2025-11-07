import { NextResponse } from "next/server";
import { getFiuuService } from "@/lib/fiuuService";

/**
 * POST /api/payments/initiate
 *
 * Generates Fiuu payment URL for customer redirect
 *
 * Body params:
 * - orderID: WooCommerce order ID
 * - amount: Payment amount (e.g., "25.50")
 * - currency: Currency code (default: "MYR")
 * - paymentMethod: Payment method code (e.g., "credit", "fpx", "grabpay")
 * - customerName: Customer name (optional)
 * - customerEmail: Customer email (optional)
 * - customerPhone: Customer phone (optional)
 * - description: Payment description (optional)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      orderID,
      amount,
      currency = "MYR",
      paymentMethod = "credit", // Default to credit card
      customerName = "",
      customerEmail = "",
      customerPhone = "",
      description = "Coffee Oasis Order",
    } = body;

    // Validation
    if (!orderID) {
      return NextResponse.json(
        { error: "orderID is required" },
        { status: 400 }
      );
    }

    if (!amount || isNaN(parseFloat(amount))) {
      return NextResponse.json(
        { error: "Valid amount is required" },
        { status: 400 }
      );
    }

    // Get base URL for callbacks
    const baseURL =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Generate payment URL
    const fiuu = getFiuuService();
    const paymentURL = fiuu.generatePaymentURL({
      orderID: String(orderID),
      amount: String(amount),
      currency,
      paymentMethod,
      returnURL: `${baseURL}/api/payments/return`,
      notifyURL: `${baseURL}/api/payments/notify`,
      callbackURL: `${baseURL}/api/payments/callback`,
      bill_name: customerName,
      bill_email: customerEmail,
      bill_mobile: customerPhone,
      bill_desc: description,
    });

    return NextResponse.json({
      success: true,
      paymentURL,
      orderID,
      amount,
      currency,
    });
  } catch (error: any) {
    console.error("❌ Payment initiation error:", error);
    return NextResponse.json(
      {
        error: "Failed to initiate payment",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
