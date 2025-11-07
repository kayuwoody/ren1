import { NextResponse } from "next/server";
import { wcApi } from "@/lib/wooClient";

/**
 * GET /api/delivery/orders
 *
 * Returns orders ready for delivery (ready-for-pickup status with _out_for_delivery flag)
 */
export async function GET(req: Request) {
  try {
    // Fetch all ready-for-pickup orders
    const response: any = await wcApi.get("orders", {
      status: "ready-for-pickup",
      per_page: 100,
      orderby: "date",
      order: "asc", // Oldest first (highest priority)
    });

    const allReadyOrders = response.data || [];

    // Filter for delivery orders only
    const deliveryOrders = allReadyOrders.filter((order: any) => {
      const outForDelivery = order.meta_data?.find((m: any) => m.key === "_out_for_delivery")?.value;
      return outForDelivery === "yes";
    });

    console.log(`🚗 Delivery: Found ${deliveryOrders.length} orders out for delivery (of ${allReadyOrders.length} ready-for-pickup)`);

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
