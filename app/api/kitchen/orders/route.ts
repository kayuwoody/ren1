import { NextResponse } from "next/server";
import { wcApi } from "@/lib/wooClient";

/**
 * GET /api/kitchen/orders
 *
 * Returns processing orders NOT yet marked as ready for kitchen display
 * Filters out orders with _kitchen_ready metadata
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

    const allProcessingOrders = response.data || [];

    // Filter out orders that are already marked as ready
    const kitchenOrders = allProcessingOrders.filter((order: any) => {
      const kitchenReady = order.meta_data?.find((m: any) => m.key === "_kitchen_ready")?.value;
      const shouldShow = kitchenReady !== "yes";

      // Debug logging
      if (!shouldShow) {
        console.log(`   🔍 Filtering out order #${order.id}: _kitchen_ready=${kitchenReady}`);
      }

      return shouldShow;
    });

    console.log(`✅ Kitchen: Found ${kitchenOrders.length} orders needing prep (${allProcessingOrders.length} total processing)`);

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
