import { NextResponse } from "next/server";
import { getFiuuService } from "@/lib/fiuuService";
import {
  getWooOrder,
  setWooOrderStatus,
  appendWooOrderMeta,
} from "@/lib/orderService";

/**
 * POST /api/payments/notify
 *
 * Fiuu Notification URL (webhook) - Server-to-server callback
 * This is the MOST RELIABLE method for payment confirmation
 *
 * Fiuu sends this immediately after payment completion
 * Must respond with "OK" to acknowledge receipt
 */
export async function POST(req: Request) {
  try {
    // Parse form data from Fiuu
    const formData = await req.formData();
    const callback = {
      tranID: formData.get("tranID") as string,
      orderid: formData.get("orderid") as string,
      status: formData.get("status") as string,
      domain: formData.get("domain") as string,
      amount: formData.get("amount") as string,
      currency: formData.get("currency") as string,
      paydate: formData.get("paydate") as string,
      skey: formData.get("skey") as string,
      // Optional fields
      channel: formData.get("channel") as string,
      appcode: formData.get("appcode") as string,
      error_code: formData.get("error_code") as string,
      error_desc: formData.get("error_desc") as string,
    };

    console.log("📥 Fiuu notification received:", {
      orderid: callback.orderid,
      status: callback.status,
      amount: callback.amount,
    });

    // Verify callback signature
    const fiuu = getFiuuService();
    const isValid = fiuu.verifyCallback(callback);

    if (!isValid) {
      console.error("❌ Invalid Fiuu signature (skey):", callback);
      return new NextResponse("INVALID_SIGNATURE", { status: 400 });
    }

    console.log("✅ Fiuu signature verified");

    // Check if payment was successful
    const isSuccess = fiuu.isPaymentSuccessful(callback.status);
    const statusDesc = fiuu.getStatusDescription(callback.status);

    // Update WooCommerce order
    try {
      const orderID = callback.orderid;

      // First, verify the order exists
      const order = await getWooOrder(orderID);
      if (!order) {
        console.error("❌ Order not found:", orderID);
        return new NextResponse("ORDER_NOT_FOUND", { status: 404 });
      }

      // Add payment metadata
      await appendWooOrderMeta(orderID, [
        { key: "_fiuu_transaction_id", value: callback.tranID },
        { key: "_fiuu_payment_status", value: callback.status },
        { key: "_fiuu_payment_status_desc", value: statusDesc },
        { key: "_fiuu_payment_date", value: callback.paydate },
        { key: "_fiuu_payment_channel", value: callback.channel || "" },
        { key: "_fiuu_appcode", value: callback.appcode || "" },
        {
          key: "_fiuu_payment_amount",
          value: `${callback.amount} ${callback.currency}`,
        },
      ]);

      // Update order status based on payment result
      if (isSuccess) {
        // Payment successful - mark as processing (ready to prepare)
        await setWooOrderStatus(orderID, "processing");
        console.log(`✅ Order ${orderID} marked as processing (payment successful)`);
      } else {
        // Payment failed - mark as failed
        await setWooOrderStatus(orderID, "failed");
        console.log(`❌ Order ${orderID} marked as failed (payment unsuccessful)`);

        // Add error info if present
        if (callback.error_code || callback.error_desc) {
          await appendWooOrderMeta(orderID, [
            { key: "_fiuu_error_code", value: callback.error_code || "" },
            { key: "_fiuu_error_desc", value: callback.error_desc || "" },
          ]);
        }
      }

      // Respond with OK to acknowledge receipt
      return new NextResponse("OK", { status: 200 });
    } catch (orderError: any) {
      console.error("❌ Failed to update order:", orderError);
      // Still return OK to Fiuu to prevent retries
      // Log the error for manual investigation
      return new NextResponse("OK", { status: 200 });
    }
  } catch (error: any) {
    console.error("❌ Payment notification error:", error);
    return new NextResponse("ERROR", { status: 500 });
  }
}

/**
 * GET handler for testing
 * Fiuu uses POST, but this allows manual verification that endpoint exists
 */
export async function GET() {
  return NextResponse.json({
    message: "Fiuu notification endpoint",
    method: "POST only",
  });
}
