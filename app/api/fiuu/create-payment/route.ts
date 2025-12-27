import { NextRequest, NextResponse } from "next/server";
import { getFiuuService, FIUU_CHANNELS, getFiuuClientConfig } from "@/lib/fiuuService";

/**
 * POST /api/fiuu/create-payment
 *
 * Creates payment parameters for Fiuu integration.
 * Returns different data depending on the payment method:
 * - Credit Card: Returns Inpage Checkout parameters (for iframe)
 * - E-Wallets/FPX: Returns payment URL (for redirect/popup)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderID,
      amount,
      currency = "MYR",
      channel,
      billName = "Customer",
      billEmail = "",
      billMobile = "",
      billDesc = "",
    } = body;

    // Validate required fields
    if (!orderID || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: orderID, amount" },
        { status: 400 }
      );
    }

    // Validate amount format
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < 1.0) {
      return NextResponse.json(
        { success: false, error: "Amount must be at least 1.00" },
        { status: 400 }
      );
    }

    const fiuu = getFiuuService();
    const clientConfig = getFiuuClientConfig();

    // Build callback URLs
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || "https://app.coffee-oasis.com.my";
    const returnURL = `${baseURL}/api/fiuu/return`;
    const callbackURL = `${baseURL}/api/fiuu/callback`;
    const notifyURL = `${baseURL}/api/fiuu/notify`;

    const paymentParams = {
      orderID: String(orderID),
      amount: amountNum.toFixed(2),
      currency,
      billName,
      billEmail,
      billMobile,
      billDesc: billDesc || `Order #${orderID}`,
    };

    // Credit card uses Inpage Checkout (iframe)
    if (!channel || channel === FIUU_CHANNELS.CREDIT) {
      const inpageParams = fiuu.generateInpageCheckoutParams(
        paymentParams,
        returnURL,
        callbackURL,
        notifyURL
      );

      return NextResponse.json({
        success: true,
        method: "inpage",
        params: inpageParams,
        config: {
          apiHost: clientConfig.apiHost,
          merchantID: clientConfig.merchantID,
          sandboxMode: clientConfig.sandboxMode,
        },
      });
    }

    // E-Wallets and FPX use redirect/popup
    const paymentURL = fiuu.generateSeamlessPaymentURL(
      paymentParams,
      channel,
      returnURL
    );

    return NextResponse.json({
      success: true,
      method: "redirect",
      paymentURL,
      channel,
      config: {
        apiHost: clientConfig.apiHost,
        sandboxMode: clientConfig.sandboxMode,
      },
    });
  } catch (error: any) {
    console.error("Fiuu create-payment error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create payment" },
      { status: 500 }
    );
  }
}
