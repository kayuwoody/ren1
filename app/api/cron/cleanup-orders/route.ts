import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError } from '@/lib/api/error-handler';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  try {
    console.log('🧹 Starting order cleanup job...');

    const readyOrders = db.prepare(`
      SELECT * FROM "Order" WHERE status = 'ready-for-pickup'
    `).all() as any[];

    if (readyOrders.length === 0) {
      console.log('✅ No orders to clean up');
      return NextResponse.json({ success: true, message: 'No orders to clean up', processed: 0 });
    }

    console.log(`📦 Found ${readyOrders.length} ready orders to check`);

    const now = Date.now();
    const completedOrders: string[] = [];

    for (const order of readyOrders) {
      const readyTime = order.readyTimestamp
        ? new Date(order.readyTimestamp).getTime()
        : new Date(order.updatedAt).getTime();

      const hoursReady = (now - readyTime) / (1000 * 60 * 60);

      if (now - readyTime > SIX_HOURS_MS) {
        console.log(`⏰ Order #${order.orderNumber}: Auto-completing (ready for ${hoursReady.toFixed(1)}h)`);

        db.prepare(`
          UPDATE "Order" SET status = 'completed', updatedAt = ? WHERE id = ?
        `).run(new Date().toISOString(), order.id);

        completedOrders.push(order.id);
      }
    }

    console.log(`✅ Cleanup complete. Auto-completed ${completedOrders.length} orders`);

    return NextResponse.json({
      success: true,
      message: `Auto-completed ${completedOrders.length} orders`,
      checked: readyOrders.length,
      completed: completedOrders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error, '/api/cron/cleanup-orders');
  }
}
