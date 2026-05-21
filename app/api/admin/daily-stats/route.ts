import { NextResponse } from 'next/server';
import { getDailyStats } from '@/lib/db/orderService';
import { getOnlineDailyStats } from '@/lib/db/onlineOrderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const [posStats, onlineStats] = await Promise.all([
      Promise.resolve(getDailyStats(branchId)),
      getOnlineDailyStats('main'),
    ]);

    return NextResponse.json({
      todayOrders: posStats.todayOrders + onlineStats.orderCount,
      todayRevenue: posStats.todayRevenue + onlineStats.revenue,
      itemsSold: posStats.itemsSold + onlineStats.itemsSold,
      pendingOrders: posStats.pendingOrders + onlineStats.pendingCount,
    });
  } catch (error) {
    console.error('Failed to fetch daily stats:', error);
    return NextResponse.json({
      todayOrders: 0,
      todayRevenue: 0,
      itemsSold: 0,
      pendingOrders: 0,
    });
  }
}
