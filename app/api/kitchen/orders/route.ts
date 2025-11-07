import { NextResponse } from "next/server";
import { wcApi } from "@/lib/wooClient";

/**
 * GET /api/kitchen/orders
 *
 * Returns ALL processing orders for kitchen display
 * No user filtering - shows all orders being prepared
 */
export async function GET(req: Request) {
  try {
    // Fetch all orders with status=processing (no user filter)
    const response: any = await wcApi.get("orders", {
      status: "processing",
      per_page: 100, // Max orders to show
      orderby: "date",
      order: "asc", // Oldest first (highest priority)
    });

    const orders = response.data || [];

    console.log(`✅ Kitchen: Found ${orders.length} processing orders`);

    return NextResponse.json(orders);
  } catch (err: any) {
    console.error("❌ /api/kitchen/orders error:", err);
    return NextResponse.json(
      {
        error: "Failed to load kitchen orders",
        details: err?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
