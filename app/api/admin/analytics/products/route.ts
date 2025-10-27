/**
 * API Route: Product Performance Comparison
 * GET /api/admin/analytics/products
 */

import { NextRequest, NextResponse } from 'next/server';
import { compareProducts, getProductsWithDecliningMargins } from '@/lib/db/analyticsService';

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
    const category = searchParams.get('category') || undefined;

    const products = compareProducts(start, end, category);
    const decliningMargins = getProductsWithDecliningMargins(30);

    return NextResponse.json({
      products,
      decliningMargins,
      period: { start, end },
    });
  } catch (error: any) {
    console.error('Error fetching product analytics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch product analytics' },
      { status: 500 }
    );
  }
}
