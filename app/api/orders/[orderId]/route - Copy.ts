import { NextResponse } from "next/server";
import { getWooOrder } from "@/lib/orderService";

function getMeta(order: any, key: string): string | undefined {
  return order?.meta_data?.find((m: any) => m.key === key)?.value;
}

export async function GET(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  const id = parseInt(params.orderId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
  }

  try {
    const order = await getWooOrder(id);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const locker_number = getMeta(order, "_locker_number");
    const pickup_code = getMeta(order, "_pickup_code");
    const qr_code = getMeta(order, "_pickup_qr_url") || pickup_code;
console.log("📦 order.meta_data:", order.meta_data);
console.log("🔍 locker_number:", locker_number);
console.log("🔍 pickup_code:", pickup_code);
console.log("🔍 qr_code:", qr_code);

    return NextResponse.json({
      id: order.id,
      status: order.status,
      locker_number,
      pickup_code,
      qr_code,
      line_items: order.line_items,
      total: order.total,
    });
  } catch (err: any) {
    console.error("❌ WooCommerce fetch failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
