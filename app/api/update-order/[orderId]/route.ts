// app/api/update-order/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';
import { cookies } from 'next/headers';

export async function PATCH(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json(
      { error: 'Must supply status to update' },
      { status: 400 }
    );
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
      combinedMeta.push({ key: 'startTime', value: String(now) });
      combinedMeta.push({ key: 'endTime',   value: String(now + duration) });
    }

    // 2b) If going to ready-for-pickup, add timestamp for auto-cleanup
    if (body.status === 'ready-for-pickup') {
      combinedMeta.push({
        key: '_ready_timestamp',
        value: new Date().toISOString()
      });
    }

    // 3) Build patch payload: status + full meta_data
    const patchPayload: any = {
      status: body.status,
      meta_data: combinedMeta,
    };

    // 4) Perform the update in one go
    const updated = await updateWooOrder(orderId, patchPayload);

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
  } catch (err: any) {
    console.error('❌ /api/update-order error:', err);
    return NextResponse.json(
      { error: 'Order update failed' },
      { status: 500 }
    );
  }
}
