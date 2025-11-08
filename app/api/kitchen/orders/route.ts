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
      const shouldShow = kitchenReady !== "yes";

      // Debug logging - show ALL metadata for debugging
      console.log(`   🔍 Order #${order.id}:`);
      console.log(`      Total meta_data items: ${order.meta_data?.length || 0}`);
      if (order.meta_data && order.meta_data.length > 0) {
        order.meta_data.forEach((m: any) => {
          console.log(`        ${m.key} = ${m.value}`);
        });
      }
      console.log(`      kitchen_ready=${kitchenReady}, shouldShow=${shouldShow}`);

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
