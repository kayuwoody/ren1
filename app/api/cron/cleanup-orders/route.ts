import { NextResponse } from 'next/server';
import { fetchAllWooPages, getMetaValue } from '@/lib/api/woocommerce-helpers';
import { updateWooOrder } from '@/lib/orderService';

/**
 * Auto-Cleanup Cron Job
 *
 * Automatically marks orders as 'completed' if they've been in
 * 'ready-for-pickup' status for more than 6 hours
 *
 * This helps prevent orders from staying in ready status indefinitely
 * when customers:
 * - Forget to click "I Picked It Up" button
 * - Unlock locker but webhook fails
 * - Pick up order when offline
 *
 * Usage:
 * - Call this endpoint from a cron job (Vercel Cron, GitHub Actions, etc.)
 * - Recommended frequency: Every 30 minutes
 * - Endpoint: GET /api/cron/cleanup-orders
 *
 * Security:
 * - Add Bearer token authentication in production
 * - Or use Vercel Cron secret header
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    console.log('🧹 Starting order cleanup job...');

    // 1. Authenticate (optional - add in production)
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // 2. Fetch all orders with ready-for-pickup status (using pagination helper)
    const readyOrders = await fetchAllWooPages('orders', {
      status: 'ready-for-pickup',
    });

    if (!Array.isArray(readyOrders) || readyOrders.length === 0) {
      console.log('✅ No orders to clean up');
      return NextResponse.json({
        success: true,
        message: 'No orders to clean up',
        processed: 0
      });
    }

    console.log(`📦 Found ${readyOrders.length} ready orders to check`);

    // 3. Check each order and auto-complete if > 6 hours
    const now = Date.now();
    const completedOrders: number[] = [];

    for (const order of readyOrders) {
      try {
        // Find when order was marked as ready
        // Option 1: Check date_modified (when status changed)
        const modifiedTime = order.date_modified
          ? new Date(order.date_modified).getTime()
          : null;

        // Option 2: Check custom meta field (more accurate)
        const readyTimestamp = getMetaValue(order.meta_data, '_ready_timestamp');
        const readyTime = readyTimestamp
          ? new Date(readyTimestamp).getTime()
          : modifiedTime;

        if (!readyTime) {
          console.warn(`⚠️ Order #${order.id}: No ready timestamp found, skipping`);
          continue;
        }

        const hoursReady = (now - readyTime) / (1000 * 60 * 60);

        console.log(`📊 Order #${order.id}: Ready for ${hoursReady.toFixed(1)} hours`);

        // If > 6 hours, auto-complete
        if (now - readyTime > SIX_HOURS_MS) {
          console.log(`⏰ Order #${order.id}: Auto-completing (ready for ${hoursReady.toFixed(1)}h)`);

          await updateWooOrder(order.id, {
            status: 'completed',
            meta_data: [
              ...order.meta_data.map((m: any) => ({ key: m.key, value: m.value })),
              {
                key: '_auto_completed',
                value: 'true'
              },
              {
                key: '_auto_completed_timestamp',
                value: new Date().toISOString()
              },
              {
                key: '_auto_completed_reason',
                value: 'Order ready for pickup > 6 hours'
              }
            ]
          });

          completedOrders.push(order.id);
        }
      } catch (err) {
        console.error(`❌ Error processing order #${order.id}:`, err);
        // Continue with next order
      }
    }

    console.log(`✅ Cleanup complete. Auto-completed ${completedOrders.length} orders`);

    return NextResponse.json({
      success: true,
      message: `Auto-completed ${completedOrders.length} orders`,
      checked: readyOrders.length,
      completed: completedOrders,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return handleApiError(error, '/api/cron/cleanup-orders');
  }
}
