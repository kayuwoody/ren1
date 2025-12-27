import { NextRequest, NextResponse } from "next/server";
import { getFiuuService } from "@/lib/fiuuService";

/**
 * GET/POST /api/fiuu/return
 *
 * Return URL for browser redirects after payment.
 * Customer is redirected here after completing payment on Fiuu page.
 *
 * WARNING: Do not rely on this for critical logic - user may close browser.
 * Use the notify webhook for reliable payment confirmation.
 */
export async function GET(request: NextRequest) {
  return handleReturn(request);
}

export async function POST(request: NextRequest) {
  return handleReturn(request);
}

async function handleReturn(request: NextRequest) {
  try {
    // Get parameters from URL or form body
    let params: Record<string, string> = {};

    // Try URL params first (GET redirect)
    const url = new URL(request.url);
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    // If POST, also check form data
    if (request.method === "POST") {
      try {
        const formData = await request.formData();
        formData.forEach((value, key) => {
          params[key] = value as string;
        });
      } catch {
        // Ignore if no form data
      }
    }

    const {
      orderid,
      tranID,
      status,
      amount,
      currency,
      channel,
      error_code,
      error_desc,
    } = params;

    console.log("[Fiuu Return] Customer returned:", {
      orderid,
      status,
      tranID,
      channel,
    });

    const fiuu = getFiuuService();
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || "";

    // Redirect based on status
    if (fiuu.isPaymentSuccessful(status)) {
      // Payment successful
      const successURL = new URL("/payment/fiuu-success", baseURL);
      successURL.searchParams.set("orderid", orderid || "");
      successURL.searchParams.set("tranID", tranID || "");
      successURL.searchParams.set("amount", amount || "");
      successURL.searchParams.set("channel", channel || "");
      return NextResponse.redirect(successURL.toString());
    } else if (fiuu.isPaymentFailed(status)) {
      // Payment failed
      const failedURL = new URL("/payment/fiuu-failed", baseURL);
      failedURL.searchParams.set("orderid", orderid || "");
      failedURL.searchParams.set("error", error_desc || "Payment failed");
      return NextResponse.redirect(failedURL.toString());
    } else {
      // Pending or unknown status
      const pendingURL = new URL("/payment/fiuu-pending", baseURL);
      pendingURL.searchParams.set("orderid", orderid || "");
      pendingURL.searchParams.set("status", status || "");
      return NextResponse.redirect(pendingURL.toString());
    }
  } catch (error: any) {
    console.error("[Fiuu Return] Error:", error);
    const baseURL = process.env.NEXT_PUBLIC_APP_URL || "";
    return NextResponse.redirect(`${baseURL}/payment/fiuu-failed?error=Processing+error`);
  }
}
