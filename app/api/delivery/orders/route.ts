import { NextResponse } from "next/server";
import { wcApi } from "@/lib/wooClient";

/**
 * GET /api/delivery/orders
 *
 * Returns processing orders marked as ready for delivery (with _out_for_delivery flag)
 */
export async function GET(req: Request) {
  try {
    // Fetch all processing orders
    const response: any = await wcApi.get("orders", {
      status: "processing",
      per_page: 100,
      orderby: "date",
      order: "asc", // Oldest first (highest priority)
    });

    const allProcessingOrders = response.data || [];

    // Filter for delivery orders that are ready
    const deliveryOrders = allProcessingOrders.filter((order: any) => {
      const kitchenReady = order.meta_data?.find((m: any) => m.key === "kitchen_ready")?.value;
      const outForDelivery = order.meta_data?.find((m: any) => m.key === "out_for_delivery")?.value;
      const shouldShow = kitchenReady === "yes" && outForDelivery === "yes";

      // Debug logging for all processing orders
      console.log(`   🔍 Order #${order.id}: kitchen_ready=${kitchenReady} (${typeof kitchenReady}), out_for_delivery=${outForDelivery} (${typeof outForDelivery}), shouldShow=${shouldShow}`);

      return shouldShow;
    });

    console.log(`🚗 Delivery: Found ${deliveryOrders.length} orders ready for delivery (of ${allProcessingOrders.length} processing)`);

    return NextResponse.json(deliveryOrders);
  } catch (err: any) {
    console.error("❌ /api/delivery/orders error:", err);
    return NextResponse.json(
      {
        error: "Failed to load delivery orders",
        details: err?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
