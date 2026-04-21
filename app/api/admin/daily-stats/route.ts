import { NextResponse } from 'next/server';
import { getDailyStats } from '@/lib/db/orderService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';

export const dynamic = 'force-dynamic';

/**
 * Admin Daily Stats API
 *
 * Returns today's operational statistics from local SQLite:
 * - Total orders today
 * - Total revenue today
 * - Items sold today
 * - Pending orders
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const stats = getDailyStats(branchId);
    return NextResponse.json(stats);
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
