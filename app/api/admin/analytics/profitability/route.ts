/**
 * API Route: Profitability Trends
 * GET /api/admin/analytics/profitability
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProfitabilityTrend } from '@/lib/db/analyticsService';

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
    const groupBy = (searchParams.get('groupBy') as 'day' | 'week' | 'month') || 'week';

    const trends = getProfitabilityTrend(start, end, groupBy);

    return NextResponse.json({
      trends,
      period: { start, end, groupBy },
    });
  } catch (error: any) {
    console.error('Error fetching profitability trends:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch profitability trends' },
      { status: 500 }
    );
  }
}
