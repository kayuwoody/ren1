/**
 * API Route: List All Products with COGS
 * GET /api/admin/products/costs
 */

import { NextRequest, NextResponse } from 'next/server';
import { listActiveProducts } from '@/lib/db/productService';
import { getLatestCostBreakdown } from '@/lib/db/productService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const products = listActiveProducts();

    // Enrich with cost breakdown and margin info
    const enrichedProducts = products.map(product => {
      const costBreakdown = getLatestCostBreakdown(product.id);

      const grossProfit = product.currentPrice - product.unitCost;
      const grossMargin = product.currentPrice > 0
        ? (grossProfit / product.currentPrice) * 100
        : 0;

      return {
        ...product,
        grossProfit,
        grossMargin,
        costBreakdown: costBreakdown || null,
      };
    });

    // Sort by name
    enrichedProducts.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      products: enrichedProducts,
    });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
