/**
 * API Route: Analytics Overview
 * GET /api/admin/analytics/overview
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getCategoryPerformance,
  findFrequentPairs,
  getDiscountImpact,
} from '@/lib/db/analyticsService';
import { getOrderStats } from '@/lib/db/orderService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Default to last 30 days
    const endDate = new Date().toISOString();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const start = searchParams.get('startDate') || startDate.toISOString();
    const end = searchParams.get('endDate') || endDate;

    // Get overall order statistics
    const orderStats = getOrderStats(start, end);

    // Category performance
    const categoryPerformance = getCategoryPerformance(start, end);

    // Frequent pairs (for combo recommendations)
    const frequentPairs = findFrequentPairs(3, start, end);

    // Discount impact analysis
    const discountImpact = getDiscountImpact(start, end);

    return NextResponse.json({
      orderStats,
      categoryPerformance,
      frequentPairs: frequentPairs.slice(0, 5), // Top 5
      discountImpact,
      period: { start, end },
    });
  } catch (error: any) {
    console.error('Error fetching analytics overview:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics overview' },
      { status: 500 }
    );
  }
}
