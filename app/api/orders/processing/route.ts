import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/init';
import { handleApiError } from '@/lib/api/error-handler';
import { getOrderItems } from '@/lib/db/orderService';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const c = await cookies();
    const userIdCookie = c.get('userId')?.value;
    const url = new URL(req.url);
    const guestId = url.searchParams.get('guestId') || undefined;

    let query = `SELECT * FROM "Order" WHERE status = 'processing'`;
    const params: any[] = [];

    if (userIdCookie) {
      query += ' AND customerId = ?';
      params.push(userIdCookie);
    } else if (guestId) {
      query += ' AND guestId = ?';
      params.push(guestId);
    } else {
      return NextResponse.json([]);
    }

    query += ' ORDER BY createdAt DESC';
    const orders = db.prepare(query).all(...params) as any[];

    const result = orders.map(order => {
      const items = getOrderItems(order.id);
      return {
        id: order.id,
        number: order.orderNumber,
        status: order.status,
        total: String(order.total),
        date_created: order.createdAt,
        line_items: items.map(item => ({
          id: item.id,
          product_id: item.productId,
          name: item.productName,
          quantity: item.quantity,
        })),
        meta_data: [
          ...(order.startTime ? [{ key: 'startTime', value: order.startTime }] : []),
          ...(order.endTime ? [{ key: 'endTime', value: order.endTime }] : []),
        ],
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, '/api/orders/processing');
  }
}
