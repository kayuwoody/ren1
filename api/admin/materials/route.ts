/**
 * API Route: Materials Management
 * GET /api/admin/materials - List all materials
 * POST /api/admin/materials - Create new material
 */

import { NextRequest, NextResponse } from 'next/server';
import { listMaterials, upsertMaterial } from '@/lib/db/materialService';
import { handleApiError, validationError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as 'ingredient' | 'packaging' | 'consumable' | undefined;

    const materials = listMaterials(category);

    return NextResponse.json({ materials });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials');
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
      return validationError('Missing required fields', '/api/admin/materials');
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
  } catch (error) {
    return handleApiError(error, '/api/admin/materials');
  }
}
