/**
 * API Route: Materials Management
 * GET /api/admin/materials - List all materials
 * POST /api/admin/materials - Create new material
 */

import { NextRequest, NextResponse } from 'next/server';
import { listMaterials, upsertMaterial } from '@/lib/db/materialService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as 'ingredient' | 'packaging' | 'consumable' | undefined;

    const materials = listMaterials(category);

    return NextResponse.json({ materials });
  } catch (error: any) {
    console.error('Error fetching materials:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch materials' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      name,
      category,
      purchaseUnit,
      purchaseQuantity,
      purchaseCost,
      stockQuantity,
      lowStockThreshold,
      supplier,
    } = body;

    // Validation
    if (!name || !category || !purchaseUnit || !purchaseQuantity || !purchaseCost) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const material = upsertMaterial({
      name,
      category,
      purchaseUnit,
      purchaseQuantity: parseFloat(purchaseQuantity),
      purchaseCost: parseFloat(purchaseCost),
      stockQuantity: parseFloat(stockQuantity || 0),
      lowStockThreshold: parseFloat(lowStockThreshold || 0),
      supplier,
    });

    return NextResponse.json({ material });
  } catch (error: any) {
    console.error('Error creating material:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create material' },
      { status: 500 }
    );
  }
}
