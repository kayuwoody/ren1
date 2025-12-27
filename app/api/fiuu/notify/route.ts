import { NextRequest, NextResponse } from "next/server";
import { getFiuuService, FiuuCallbackData } from "@/lib/fiuuService";

/**
 * POST /api/fiuu/notify
 *
 * Webhook endpoint for Fiuu payment notifications.
 * This is the MOST RELIABLE way to receive payment status updates.
 * Called server-to-server by Fiuu after payment completion.
 *
 * IMPORTANT: Must return "OK" on success for Fiuu to mark notification as delivered.
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data (Fiuu sends application/x-www-form-urlencoded)
    const formData = await request.formData();
    const callback: FiuuCallbackData = {
      tranID: formData.get("tranID") as string,
      orderid: formData.get("orderid") as string,
      status: formData.get("status") as string,
      domain: formData.get("domain") as string,
      amount: formData.get("amount") as string,
      currency: formData.get("currency") as string,
      paydate: formData.get("paydate") as string,
      channel: formData.get("channel") as string,
      skey: formData.get("skey") as string,
      error_code: formData.get("error_code") as string || undefined,
      error_desc: formData.get("error_desc") as string || undefined,
    };

    console.log("[Fiuu Notify] Received:", {
      orderid: callback.orderid,
      tranID: callback.tranID,
      status: callback.status,
      amount: callback.amount,
      channel: callback.channel,
    });

    // Verify signature
    const fiuu = getFiuuService();
    const isValid = fiuu.verifyCallback(callback);

    if (!isValid) {
      console.error("[Fiuu Notify] Invalid signature for order:", callback.orderid);
      return new Response("INVALID_SIGNATURE", { status: 400 });
    }

    // Process based on status
    if (fiuu.isPaymentSuccessful(callback.status)) {
      console.log("[Fiuu Notify] Payment SUCCESS:", {
        orderid: callback.orderid,
        tranID: callback.tranID,
        amount: callback.amount,
        channel: callback.channel,
      });

      // TODO: Update order status in your database
      // For now, we'll store in a simple way that the payment page can check
      // In production, update your order database here

      // Example: await updateOrderStatus(callback.orderid, 'paid', callback);

    } else if (fiuu.isPaymentFailed(callback.status)) {
      console.log("[Fiuu Notify] Payment FAILED:", {
        orderid: callback.orderid,
        error_code: callback.error_code,
        error_desc: callback.error_desc,
      });

      // TODO: Update order status to failed
      // Example: await updateOrderStatus(callback.orderid, 'failed', callback);

    } else if (fiuu.isPaymentPending(callback.status)) {
      console.log("[Fiuu Notify] Payment PENDING:", callback.orderid);
      // Wait for final status via callback endpoint
    }

    // Must return "OK" for Fiuu to acknowledge
    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("[Fiuu Notify] Error:", error);
    return new Response("ERROR", { status: 500 });
  }
}

// Also handle GET requests (some systems send GET for testing)
export async function GET(request: NextRequest) {
  return new Response("Fiuu Notify Endpoint Active", { status: 200 });
}
