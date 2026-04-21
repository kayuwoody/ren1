import { NextResponse } from "next/server";
import { db } from "@/lib/db/init";
import { getOrderItems } from "@/lib/db/orderService";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const orders = db.prepare(`
      SELECT * FROM "Order"
      WHERE status = 'processing' AND kitchenReady = 0
      ORDER BY createdAt ASC
    `).all() as any[];

    const kitchenOrders = orders.map(order => {
      const items = getOrderItems(order.id);
      return {
        id: order.id,
        number: order.orderNumber,
        status: order.status,
        date_created: order.createdAt,
        total: String(order.total),
        line_items: items.map(item => ({
          id: item.id,
          product_id: item.productId,
          name: item.productName,
          quantity: item.quantity,
          meta_data: item.variations
            ? Object.entries(JSON.parse(item.variations)).map(([key, value]) => ({ key, value: String(value) }))
            : [],
        })),
        meta_data: [
          { key: '_branch_id', value: order.branchId || '' },
          ...(order.startTime ? [{ key: 'startTime', value: order.startTime }] : []),
          ...(order.endTime ? [{ key: 'endTime', value: order.endTime }] : []),
        ],
      };
    });

    return NextResponse.json(kitchenOrders);
  } catch (err: any) {
    console.error("❌ /api/kitchen/orders error:", err);
    return NextResponse.json(
      { error: "Failed to load kitchen orders", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
