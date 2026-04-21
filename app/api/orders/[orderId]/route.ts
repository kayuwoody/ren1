import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db/init';
import { handleApiError, notFoundError, validationError } from '@/lib/api/error-handler';
import { broadcastOrderUpdate } from '@/lib/sse/orderStreamManager';
import { getOrderWithItems, toWcOrderShape } from '@/lib/db/orderService';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const orderWithItems = getOrderWithItems(orderId);
    if (!orderWithItems) {
      return notFoundError('Order not found', '/api/orders/[orderId]');
    }
    return NextResponse.json(toWcOrderShape(orderWithItems));
  } catch (error) {
    return handleApiError(error, '/api/orders/[orderId]');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return validationError('Invalid JSON', '/api/orders/[orderId]');
  }

  if (!body.status) {
    return validationError('Must supply status to update', '/api/orders/[orderId]');
  }

  try {
    const existing = db.prepare('SELECT * FROM "Order" WHERE id = ?').get(orderId) as any;
    if (!existing) {
      return notFoundError('Order not found', '/api/orders/[orderId]');
    }

    const updates: string[] = ['status = ?', 'updatedAt = ?'];
    const values: any[] = [body.status, new Date().toISOString()];

    if (body.status === 'processing' && !existing.startTime) {
      const items = db.prepare('SELECT COUNT(*) as c FROM OrderItem WHERE orderId = ?').get(orderId) as { c: number };
      const itemCount = items.c || 1;
      const now = Date.now();
      const duration = 2 * 60_000 * itemCount;
      updates.push('startTime = ?', 'endTime = ?');
      values.push(new Date(now).toISOString(), new Date(now + duration).toISOString());
    }

    if (body.status === 'ready-for-pickup') {
      updates.push('readyTimestamp = ?');
      values.push(new Date().toISOString());
    }

    if (body.meta_data && Array.isArray(body.meta_data)) {
      for (const m of body.meta_data as Array<{ key: string; value: string }>) {
        if (m.key === 'kitchen_ready' && m.value === 'yes') {
          updates.push('kitchenReady = ?');
          values.push(1);
        }
        if (m.key === 'out_for_delivery' && m.value === 'yes') {
          updates.push('outForDelivery = ?');
          values.push(1);
        }
        if (m.key === '_locker_number') {
          updates.push('lockerNumber = ?');
          values.push(m.value);
        }
        if (m.key === '_pickup_code') {
          updates.push('pickupCode = ?');
          values.push(m.value);
        }
      }
    }

    values.push(orderId);
    db.prepare(`UPDATE "Order" SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    broadcastOrderUpdate();

    if (body.status === 'processing' && existing.status !== 'processing') {
      try {
        const orderItems = db.prepare('SELECT * FROM OrderItem WHERE orderId = ?').all(orderId) as any[];
        const lineItems = orderItems.map((item: any) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          orderItemId: item.id,
          meta_data: item.variations ? Object.entries(JSON.parse(item.variations)).map(([key, value]) => ({ key, value: String(value) })) : [],
        }));

        const consumptionResponse = await fetch(`${req.url.split('/api')[0]}/api/orders/consumption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, lineItems }),
        });

        if (!consumptionResponse.ok) {
          console.error('Failed to record inventory consumption:', await consumptionResponse.text());
        }
      } catch (consumptionErr) {
        console.error('⚠️ Error calling consumption API:', consumptionErr);
      }
    }

    if (body.status === 'ready-for-pickup') {
      try {
        const cookieStore = await cookies();
        const userId = cookieStore.get('userId')?.value;
        if (userId) {
          const updated = db.prepare('SELECT * FROM "Order" WHERE id = ?').get(orderId) as any;
          await fetch(`${req.url.split('/api')[0]}/api/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              title: 'Your order is ready!',
              body: updated?.lockerNumber
                ? `Pick up from Locker ${updated.lockerNumber}${updated.pickupCode ? ` - Code: ${updated.pickupCode}` : ''}`
                : 'Your order is ready for pickup',
              url: `/orders/${orderId}`,
              orderId,
            }),
          });
        }
      } catch (notifErr) {
        console.error('Failed to send push notification:', notifErr);
      }
    }

    const result = getOrderWithItems(orderId);
    return NextResponse.json(result ? toWcOrderShape(result) : { id: orderId });
  } catch (error) {
    return handleApiError(error, '/api/orders/[orderId]');
  }
}
