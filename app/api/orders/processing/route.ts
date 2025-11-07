// app/api/orders/processing/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { listOrdersByUser, listOrdersByGuest } from '@/lib/orderService';
import { handleApiError } from '@/lib/api/error-handler';

export async function GET(req: Request) {
  try {
    const c = cookies();
    const userIdCookie = c.get('userId')?.value;
    const url = new URL(req.url);
    const guestId = url.searchParams.get('guestId') || undefined;

    let processingOrders: any[] = [];

    // Logged‑in user: fetch only status='processing'
    if (userIdCookie) {
      processingOrders = await listOrdersByUser(Number(userIdCookie), {
        status: 'processing',
      });
    }
    // Guest fallback: same filter via meta
    else if (guestId) {
      processingOrders = await listOrdersByGuest(guestId, {
        status: 'processing',
      });
    }

    return NextResponse.json(processingOrders);
  } catch (error) {
    return handleApiError(error, '/api/orders/processing');
  }
}
