import { NextResponse } from "next/server";
import { wcApi } from "@/lib/wooClient";

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * GET /api/kitchen/orders
 *
 * Returns processing orders NOT yet marked as ready for kitchen display
 * Filters out orders with kitchen_ready metadata
 */
export async function GET(req: Request) {
  try {
    // Fetch all orders with status=processing (no user filter)
    // Add timestamp to bust WooCommerce cache
    const response: any = await wcApi.get("orders", {
      status: "processing",
      per_page: 100, // Max orders to show
      orderby: "date",
      order: "asc", // Oldest first (highest priority)
      _fields: "id,number,status,date_created,total,line_items,meta_data", // Explicitly request meta_data
      _: Date.now(), // Cache buster
    });

    const allProcessingOrders = response.data || [];

    // Filter out orders that are already marked as ready
    const kitchenOrders = allProcessingOrders.filter((order: any) => {
      const kitchenReady = order.meta_data?.find((m: any) => m.key === "kitchen_ready")?.value;
      return kitchenReady !== "yes";
    });

    return NextResponse.json(kitchenOrders);
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
