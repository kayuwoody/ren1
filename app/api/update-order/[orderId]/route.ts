// app/api/update-order/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';
import { cookies } from 'next/headers';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function PATCH(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return validationError('Invalid JSON', '/api/update-order/[orderId]');
  }

  if (!body.status) {
    return validationError('Must supply status to update', '/api/update-order/[orderId]');
  }

  try {
    // 1) Fetch existing order to grab its meta_data
    const existing = await getWooOrder(orderId);
    const existingMeta = Array.isArray(existing.meta_data)
      ? existing.meta_data.map((m: any) => ({ key: m.key, value: m.value }))
      : [];

    let combinedMeta = [...existingMeta];

    // 2) If going into processing, append fresh timer fields
    if (body.status === 'processing') {
      const itemCount = existing.line_items?.length ?? 1;
      const now = Date.now();
      const duration = 2 * 60_000 * itemCount; // 2 min per item

      // Only add timer if not already present (don't reset timer for delivery orders)
      const hasTimer = existingMeta.some((m: any) => m.key === 'startTime' || m.key === 'endTime');
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
      for (const newMeta of body.meta_data) {
        // Remove existing entry with same key if exists
        combinedMeta = combinedMeta.filter((m: any) => m.key !== newMeta.key);
        // Add new value
        combinedMeta.push({ key: newMeta.key, value: newMeta.value });
      }
    }

    // 3) Build patch payload: status + full meta_data
    const patchPayload: any = {
      status: body.status,
      meta_data: combinedMeta,
    };

    // 4) Perform the update in one go
    const updated = await updateWooOrder(orderId, patchPayload);

    console.log(`✅ Updated order #${orderId} to status: ${body.status}`);
    if (body.meta_data) {
      console.log(`   Added metadata:`, body.meta_data.map((m: any) => m.key).join(', '));
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

          console.log(`📬 Push notification sent for order #${orderId}`);
        }
      } catch (notifErr) {
        console.error('Failed to send push notification:', notifErr);
        // Don't fail the order update if notification fails
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/update-order/[orderId]');
  }
}
