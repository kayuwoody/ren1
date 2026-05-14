import { NextResponse } from "next/server";
import { db } from "@/lib/db/init";
import { getOrderItems } from "@/lib/db/orderService";
import { supabase } from "@/lib/supabase";

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
        source: 'pos' as const,
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

    let onlineOrders: any[] = [];
    try {
      const { data, error } = await supabase
        .from('online_orders')
        .select(`
          id, status, pickup_type, customer_name,
          total_paid, created_at,
          online_order_items ( id, product_id, product_name, qty, unit_price, mods )
        `)
        .eq('outlet_id', 'main')
        .eq('status', 'accepted')
        .order('created_at', { ascending: true });

      if (!error && data) {
        onlineOrders = data.map(order => {
          const items = (order.online_order_items ?? []) as any[];
          return {
            id: order.id,
            number: order.id,
            status: 'processing',
            date_created: order.created_at,
            total: String(order.total_paid),
            source: 'online' as const,
            pickup_type: order.pickup_type,
            customer_name: order.customer_name,
            line_items: items.map(item => {
              const modsEntries = item.mods
                ? Object.entries(item.mods as Record<string, string>)
                    .filter(([k, v]) => v && k !== 'notes')
                    .map(([key, value]) => ({ key, value: String(value) }))
                : [];
              const notes = item.mods?.notes;
              if (notes) {
                modsEntries.push({ key: 'Notes', value: notes });
              }
              return {
                id: item.id,
                product_id: item.product_id,
                name: item.product_name,
                quantity: item.qty,
                meta_data: modsEntries,
              };
            }),
            meta_data: [],
          };
        });
      }
    } catch (err) {
      console.error("⚠️ Failed to fetch online orders for kitchen:", err);
    }

    const allOrders = [...kitchenOrders, ...onlineOrders];
    allOrders.sort((a, b) => new Date(a.date_created).getTime() - new Date(b.date_created).getTime());

    return NextResponse.json(allOrders);
  } catch (err: any) {
    console.error("❌ /api/kitchen/orders error:", err);
    return NextResponse.json(
      { error: "Failed to load kitchen orders", details: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
