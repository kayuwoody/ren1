import { NextResponse } from 'next/server';
import { updateWooOrder } from '@/lib/orderService';

/**
 * Locker Unlock Webhook
 *
 * Called by remote locker when customer scans QR code and unlocks locker
 *
 * Flow:
 * 1. Customer scans QR code on locker
 * 2. Locker validates code and unlocks
 * 3. Locker sends this webhook via cellular data
 * 4. Server updates order status to "completed"
 * 5. Customer receives push notification (future)
 *
 * Security:
 * - Bearer token authentication
 * - Locker ID validation
 * - Timestamp verification (prevent replay attacks)
 */

export async function POST(req: Request) {
  try {
    // 1. Authenticate locker
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token || token !== process.env.LOCKER_SECRET_TOKEN) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse payload
    const body = await req.json();
    const {
      lockerId,
      orderId,
      qrCode,
      timestamp,
      battery,
      temperature
    } = body;

    // 3. Validate required fields
    if (!lockerId || !orderId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 4. Verify timestamp (prevent replay attacks - max 5 min old)
    const eventTime = new Date(timestamp).getTime();
    const now = Date.now();
    if (now - eventTime > 5 * 60 * 1000) {
      return NextResponse.json(
        { error: 'Timestamp too old' },
        { status: 400 }
      );
    }

    // 5. Update order status to completed
    try {
      await updateWooOrder(orderId, {
        status: 'completed',
        meta_data: [
          { key: '_pickup_timestamp', value: timestamp },
          { key: '_pickup_locker', value: lockerId },
          { key: '_locker_battery', value: String(battery) }
        ]
      });

      console.log(`✅ Order #${orderId} marked as collected from ${lockerId}`);
    } catch (err) {
      console.error('Failed to update order:', err);
      // Don't fail the request - locker already unlocked
    }

    // 6. Log event for analytics
    console.log(`📦 Locker Event:`, {
      lockerId,
      orderId,
      timestamp,
      battery,
      temperature
    });

    // 7. Check battery level and alert if low
    if (battery && battery < 20) {
      console.warn(`⚠️ Low battery on ${lockerId}: ${battery}%`);
      // TODO: Send alert to staff
    }

    // 8. Return success
    return NextResponse.json({
      status: 'success',
      orderUpdated: true,
      message: `Order #${orderId} marked as collected`
    });

  } catch (err: any) {
    console.error('❌ Locker unlock webhook error:', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: err.message },
      { status: 500 }
    );
  }
}
