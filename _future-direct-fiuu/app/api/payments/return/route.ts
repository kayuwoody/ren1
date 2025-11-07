import { NextResponse } from "next/server";
import { getFiuuService } from "@/lib/fiuuService";

/**
 * GET /api/payments/return
 *
 * Fiuu Return URL - Browser redirect after payment
 * This is for UI/UX purposes only - DO NOT rely on this for order status
 * Use notification URL (webhook) for reliable payment confirmation
 *
 * Customer is redirected here after completing/canceling payment
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Extract parameters from query string
    const callback = {
      tranID: params.get("tranID") || "",
      orderid: params.get("orderid") || "",
      status: params.get("status") || "",
      domain: params.get("domain") || "",
      amount: params.get("amount") || "",
      currency: params.get("currency") || "",
      paydate: params.get("paydate") || "",
      skey: params.get("skey") || "",
      channel: params.get("channel") || "",
      appcode: params.get("appcode") || "",
    };

    console.log("🔄 Fiuu return redirect:", {
      orderid: callback.orderid,
      status: callback.status,
    });

    // Verify signature (same as notification)
    const fiuu = getFiuuService();
    const isValid = fiuu.verifyCallback(callback);

    if (!isValid) {
      console.warn("⚠️ Invalid return URL signature:", callback);
      // Redirect to failure page
      return NextResponse.redirect(
        new URL(`/payment/failed?order=${callback.orderid}&reason=invalid_signature`, req.url)
      );
    }

    // Check payment status
    const isSuccess = fiuu.isPaymentSuccessful(callback.status);

    if (isSuccess) {
      // Redirect to success page
      console.log(`✅ Payment return successful for order ${callback.orderid}`);
      return NextResponse.redirect(
        new URL(
          `/payment/success?order=${callback.orderid}&txn=${callback.tranID}`,
          req.url
        )
      );
    } else {
      // Redirect to failure page
      console.log(`❌ Payment return failed for order ${callback.orderid}`);
      return NextResponse.redirect(
        new URL(
          `/payment/failed?order=${callback.orderid}&status=${callback.status}`,
          req.url
        )
      );
    }
  } catch (error: any) {
    console.error("❌ Payment return error:", error);
    return NextResponse.redirect(new URL("/payment/error", req.url));
  }
}

/**
 * POST handler (Fiuu might send POST instead of GET)
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const callback = {
      tranID: formData.get("tranID") as string || "",
      orderid: formData.get("orderid") as string || "",
      status: formData.get("status") as string || "",
      domain: formData.get("domain") as string || "",
      amount: formData.get("amount") as string || "",
      currency: formData.get("currency") as string || "",
      paydate: formData.get("paydate") as string || "",
      skey: formData.get("skey") as string || "",
    };

    const fiuu = getFiuuService();
    const isValid = fiuu.verifyCallback(callback);
    const isSuccess = isValid && fiuu.isPaymentSuccessful(callback.status);

    const baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (isSuccess) {
      return NextResponse.redirect(
        `${baseURL}/payment/success?order=${callback.orderid}&txn=${callback.tranID}`
      );
    } else {
      return NextResponse.redirect(
        `${baseURL}/payment/failed?order=${callback.orderid}&status=${callback.status}`
      );
    }
  } catch (error: any) {
    console.error("❌ Payment return POST error:", error);
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(`${baseURL}/payment/error`);
  }
}
