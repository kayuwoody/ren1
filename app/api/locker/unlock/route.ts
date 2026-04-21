import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError, unauthorizedError } from '@/lib/api/error-handler';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || token !== process.env.LOCKER_SECRET_TOKEN) {
      return unauthorizedError('Unauthorized', '/api/locker/unlock');
    }

    const body = await req.json();
    const { lockerId, orderId, qrCode, timestamp, battery, temperature } = body;

    if (!lockerId || !orderId) {
      return validationError('Missing required fields', '/api/locker/unlock');
    }

    const eventTime = new Date(timestamp).getTime();
    const now = Date.now();
    if (now - eventTime > 5 * 60 * 1000) {
      return validationError('Timestamp too old', '/api/locker/unlock');
    }

    try {
      db.prepare(`
        UPDATE "Order" SET status = 'completed', updatedAt = ? WHERE id = ?
      `).run(new Date().toISOString(), orderId);

      console.log(`✅ Order #${orderId} marked as collected from ${lockerId}`);
    } catch (err) {
      console.error('Failed to update order:', err);
    }

    console.log(`📦 Locker Event:`, { lockerId, orderId, timestamp, battery, temperature });

    if (battery && battery < 20) {
      console.warn(`⚠️ Low battery on ${lockerId}: ${battery}%`);
    }

    return NextResponse.json({
      status: 'success',
      orderUpdated: true,
      message: `Order #${orderId} marked as collected`,
    });
  } catch (error) {
    return handleApiError(error, '/api/locker/unlock');
  }
}
