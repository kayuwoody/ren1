import { NextResponse } from "next/server";
import { db } from "@/lib/db/init";
import { getOrderItems } from "@/lib/db/orderService";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const orders = db.prepare(`
      SELECT * FROM "Order"
      WHERE status = 'processing' AND kitchenReady = 1 AND outForDelivery = 1
      ORDER BY createdAt ASC
    `).all() as any[];

    const deliveryOrders = orders.map(order => {
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
          { key: 'kitchen_ready', value: 'yes' },
          { key: 'out_for_delivery', value: 'yes' },
        ],
        billing: {
          first_name: order.billingName || order.customerName || '',
          phone: order.billingPhone || order.customerPhone || '',
          email: order.billingEmail || '',
          address_1: order.billingAddress || '',
        },
      };
    });

    return NextResponse.json(deliveryOrders);
  } catch (err: any) {
    console.error("❌ /api/delivery/orders error:", err);
    return NextResponse.json(
      { error: "Failed to load delivery orders", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
