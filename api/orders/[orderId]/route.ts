// app/api/orders/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';
import { handleApiError, notFoundError, validationError } from '@/lib/api/error-handler';
import { broadcastOrderUpdate } from '@/lib/sse/orderStreamManager';

export async function GET(
  _req: Request,
  { params }: { params: { orderId: string } }
) {
  try {
    // Fetch the *full* order, meta_data included
    const order = await getWooOrder(params.orderId);
    return NextResponse.json(order, { status: 200 });
  } catch (error: unknown) {
    // Check if this is a 404 (order not found/deleted)
    const err = error as { data?: { status?: number }; response?: { status?: number }; code?: string };
    const statusCode = err?.data?.status || err?.response?.status;
    const errorCode = err?.code;

    if (statusCode === 404 || errorCode === 'woocommerce_rest_shop_order_invalid_id') {
      return notFoundError('Order not found', '/api/orders/[orderId]');
    }

    return handleApiError(error, '/api/orders/[orderId]');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return validationError('Invalid JSON', '/api/orders/[orderId]');
  }

  // Status is required for order updates
  if (!body.status) {
    return validationError('Must supply status to update', '/api/orders/[orderId]');
  }

  try {
    // 1) Fetch existing order to grab its meta_data
    const existing = await getWooOrder(orderId);
    const existingMeta = Array.isArray(existing.meta_data)
      ? existing.meta_data.map((m: { key: string; value: string }) => ({ key: m.key, value: m.value }))
      : [];

    let combinedMeta = [...existingMeta];

    // 2) If going into processing, append fresh timer fields
    if (body.status === 'processing') {
      const itemCount = existing.line_items?.length ?? 1;
      const now = Date.now();
      const duration = 2 * 60_000 * itemCount; // 2 min per item

      // Only add timer if not already present (don't reset timer for delivery orders)
      const hasTimer = existingMeta.some((m: { key: string }) => m.key === 'startTime' || m.key === 'endTime');
      if (!hasTimer) {
        combinedMeta.push({ key: 'startTime', value: new Date(now).toISOString() });
        combinedMeta.push({ key: 'endTime', value: new Date(now + duration).toISOString() });
      }
    }

    // 2b) If going to ready-for-pickup, add timestamp for auto-cleanup
    if (body.status === 'ready-for-pickup') {
      combinedMeta.push({
        key: '_ready_timestamp',
        value: new Date().toISOString()
      });
    }

    // 2c) Merge any additional metadata from request body
    if (body.meta_data && Array.isArray(body.meta_data)) {
      for (const newMeta of body.meta_data as Array<{ key: string; value: string }>) {
        // Remove existing entry with same key if exists
        combinedMeta = combinedMeta.filter((m) => m.key !== newMeta.key);
        // Add new value
        combinedMeta.push({ key: newMeta.key, value: newMeta.value });
      }
    }

    // 3) Build patch payload: status + full meta_data
    const patchPayload = {
      status: body.status,
      meta_data: combinedMeta,
    };

    // 4) Perform the update in one go
    const updated = await updateWooOrder(orderId, patchPayload);

    // Broadcast order update to kitchen displays whenever status changes
    broadcastOrderUpdate();

    // 4b) If order just moved to processing, record inventory consumption
    if (body.status === 'processing' && existing.status !== 'processing') {
      try {
        // Prepare line items for consumption API
        const lineItems = existing.line_items.map((item: { product_id: number; name: string; quantity: number; id: number; meta_data: unknown }) => ({
          productId: item.product_id,
          productName: item.name,
          quantity: item.quantity,
          orderItemId: item.id,
          meta_data: item.meta_data,
        }));

        // Call consumption API
        const consumptionResponse = await fetch(`${req.url.split('/api')[0]}/api/orders/consumption`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            lineItems,
          }),
        });

        if (!consumptionResponse.ok) {
          console.error(`Failed to record inventory consumption:`, await consumptionResponse.text());
        }
      } catch (consumptionErr) {
        console.error('   ⚠️ Error calling consumption API:', consumptionErr);
        // Don't fail the order update if consumption recording fails
      }
    }

    // 5) If order is now ready, send push notification
    if (body.status === 'ready-for-pickup') {
      try {
        const cookieStore = cookies();
        const userIdCookie = cookieStore.get('userId');
        const userId = userIdCookie?.value;

        if (userId) {
          // Get locker info from meta
          const lockerNumber = combinedMeta.find(m => m.key === '_locker_number')?.value;
          const pickupCode = combinedMeta.find(m => m.key === '_pickup_code')?.value;

          await fetch(`${req.url.split('/api')[0]}/api/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              title: '🎉 Your order is ready!',
              body: lockerNumber
                ? `Pick up from Locker ${lockerNumber}${pickupCode ? ` • Code: ${pickupCode}` : ''}`
                : 'Your order is ready for pickup',
              url: `/orders/${orderId}`,
              orderId
            })
          });
        }
      } catch (notifErr) {
        console.error('Failed to send push notification:', notifErr);
        // Don't fail the order update if notification fails
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/orders/[orderId]');
  }
}
