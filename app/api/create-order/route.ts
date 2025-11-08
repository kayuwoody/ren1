import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createWooOrder } from '@/lib/orderService';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export async function POST(req: Request) {
   try {
    const body = await req.json();
    const { line_items, guestId, meta_data: extraMeta = [] } = body;

    // Validate line_items
    if (!Array.isArray(line_items) || line_items.length === 0) {
      return validationError('Must supply at least one line_items entry', '/api/create-order');
    }

    // Logged‑in user?
    const userIdCookie = cookies().get('userId')?.value;
    const userId = userIdCookie ? Number(userIdCookie) : undefined;

    // Compute kitchen timing window
    const now = Date.now();
    const duration = 2 * 60_000 * line_items.length; // 2min per item
    const startTime = String(now);
    const endTime   = String(now + duration);

    // Guest fallback (only used if no userId)
    // const guestId = userId ? undefined : body.guestId;

    // Build the full payload, embedding both guest/user and timer meta
    const payload = {
      line_items,
      userId,
      guestId: userId ? undefined : guestId,
      meta_data: [
        ...extraMeta,
        { key: 'startTime', value: startTime },
        { key: 'endTime',   value: endTime },
      ],
    };
console.log("payload: ",payload);
    const order = await createWooOrder(payload);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return handleApiError(error, '/api/create-order');
  }
}
