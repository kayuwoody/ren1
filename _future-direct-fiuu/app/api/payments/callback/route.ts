import { NextResponse } from "next/server";
import { getFiuuService } from "@/lib/fiuuService";
import {
  getWooOrder,
  setWooOrderStatus,
  appendWooOrderMeta,
} from "@/lib/orderService";

/**
 * POST /api/payments/callback
 *
 * Fiuu Callback URL - Delayed payment status updates
 * Handles payments that complete after initial response (e.g., bank transfers, QR codes)
 *
 * Similar to notification URL but for non-realtime payment methods
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

    console.log("📞 Fiuu callback received (delayed):", {
      orderid: callback.orderid,
      status: callback.status,
      amount: callback.amount,
    });

    // Verify callback signature
    const fiuu = getFiuuService();
    const isValid = fiuu.verifyCallback(callback);

    if (!isValid) {
      console.error("❌ Invalid Fiuu callback signature (skey):", callback);
      return new NextResponse("INVALID_SIGNATURE", { status: 400 });
    }

    console.log("✅ Fiuu callback signature verified");

    // Check if payment was successful
    const isSuccess = fiuu.isPaymentSuccessful(callback.status);
    const statusDesc = fiuu.getStatusDescription(callback.status);

    // Update WooCommerce order
    try {
      const orderID = callback.orderid;

      // Verify the order exists
      const order = await getWooOrder(orderID);
      if (!order) {
        console.error("❌ Order not found:", orderID);
        return new NextResponse("ORDER_NOT_FOUND", { status: 404 });
      }

      // Check current order status to avoid duplicate processing
      const currentStatus = order.status;
      console.log(`📊 Order ${orderID} current status: ${currentStatus}`);

      // Add/update payment metadata
      await appendWooOrderMeta(orderID, [
        { key: "_fiuu_transaction_id", value: callback.tranID },
        { key: "_fiuu_payment_status", value: callback.status },
        { key: "_fiuu_payment_status_desc", value: statusDesc },
        { key: "_fiuu_payment_date", value: callback.paydate },
        { key: "_fiuu_payment_channel", value: callback.channel || "" },
        { key: "_fiuu_appcode", value: callback.appcode || "" },
        { key: "_fiuu_callback_type", value: "delayed" },
        {
          key: "_fiuu_payment_amount",
          value: `${callback.amount} ${callback.currency}`,
        },
      ]);

      // Only update status if order is still pending/on-hold
      // Don't override completed/failed orders
      const updatableStatuses = ["pending", "on-hold", "pending-payment"];
      if (updatableStatuses.includes(currentStatus)) {
        if (isSuccess) {
          // Payment successful - mark as processing
          await setWooOrderStatus(orderID, "processing");
          console.log(`✅ Order ${orderID} marked as processing (delayed payment successful)`);
        } else {
          // Payment failed - mark as failed
          await setWooOrderStatus(orderID, "failed");
          console.log(`❌ Order ${orderID} marked as failed (delayed payment unsuccessful)`);

          // Add error info if present
          if (callback.error_code || callback.error_desc) {
            await appendWooOrderMeta(orderID, [
              { key: "_fiuu_error_code", value: callback.error_code || "" },
              { key: "_fiuu_error_desc", value: callback.error_desc || "" },
            ]);
          }
        }
      } else {
        console.log(
          `ℹ️ Order ${orderID} status not updated (current: ${currentStatus}, payment: ${statusDesc})`
        );
      }

      // Respond with OK to acknowledge receipt
      return new NextResponse("OK", { status: 200 });
    } catch (orderError: any) {
      console.error("❌ Failed to update order:", orderError);
      // Still return OK to Fiuu to prevent retries
      return new NextResponse("OK", { status: 200 });
    }
  } catch (error: any) {
    console.error("❌ Payment callback error:", error);
    return new NextResponse("ERROR", { status: 500 });
  }
}

/**
 * GET handler for testing
 */
export async function GET() {
  return NextResponse.json({
    message: "Fiuu callback endpoint (delayed payments)",
    method: "POST only",
  });
}
