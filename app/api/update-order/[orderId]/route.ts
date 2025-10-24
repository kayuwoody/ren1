// app/api/update-order/[orderId]/route.ts
import { NextResponse } from 'next/server';
import { getWooOrder, updateWooOrder } from '@/lib/orderService';

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
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('❌ /api/update-order error:', err);
    return NextResponse.json(
      { error: 'Order update failed' },
      { status: 500 }
    );
  }
}
