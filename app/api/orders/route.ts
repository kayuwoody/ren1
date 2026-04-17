import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/init';
import { handleApiError } from '@/lib/api/error-handler';
import { getOrderItems } from '@/lib/db/orderService';

export const dynamic = 'force-dynamic';

function toNum(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sp = url.searchParams;
    const guestId = sp.get('guestId') || undefined;
    const status = sp.get('status') || undefined;
    const page = toNum(sp.get('page'), 1);
    const perPage = toNum(sp.get('per_page'), 50);

    const userIdCookie = (await cookies()).get('userId')?.value;

    let query = 'SELECT * FROM "Order" WHERE 1=1';
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

    if (status) {
      const statuses = status.split(',');
      query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
    params.push(perPage, (page - 1) * perPage);

    const orders = db.prepare(query).all(...params) as any[];

    const result = orders.map(order => {
      const items = getOrderItems(order.id);
      return {
        id: order.id,
        number: order.orderNumber,
        status: order.status,
        total: String(order.total),
        date_created: order.createdAt,
        billing: { first_name: order.customerName || 'Guest', phone: order.customerPhone || '' },
        line_items: items.map(item => ({
          id: item.id,
          product_id: item.productId,
          name: item.productName,
          quantity: item.quantity,
          price: item.finalPrice,
          total: String(item.subtotal),
        })),
        meta_data: [
          { key: '_branch_id', value: order.branchId || '' },
          ...(order.startTime ? [{ key: 'startTime', value: order.startTime }] : []),
          ...(order.endTime ? [{ key: 'endTime', value: order.endTime }] : []),
          ...(order.lockerNumber ? [{ key: '_locker_number', value: order.lockerNumber }] : []),
          ...(order.pickupCode ? [{ key: '_pickup_code', value: order.pickupCode }] : []),
        ],
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, '/api/orders');
  }
}
