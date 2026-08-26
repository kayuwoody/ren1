/**
 * API Route: Materials Management
 * GET /api/admin/materials - List all materials with branch-specific stock
 * POST /api/admin/materials - Create new material
 */

import { NextRequest, NextResponse } from 'next/server';
import { upsertMaterial } from '@/lib/db/materialService';
import { adjustBranchStock, getBranchStock } from '@/lib/db/branchStockService';
import { logStockMovement } from '@/lib/db/stockMovementService';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { db, initDatabase } from '@/lib/db/init';

initDatabase();

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const branchId = getBranchIdFromRequest(request);
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as 'ingredient' | 'packaging' | 'consumable' | undefined;

    // Join Material with BranchStock to get branch-specific quantities
    let query = `
      SELECT m.*,
             COALESCE(bs.stockQuantity, 0) as stockQuantity,
             COALESCE(bs.lowStockThreshold, m.lowStockThreshold) as lowStockThreshold
      FROM Material m
      LEFT JOIN BranchStock bs ON bs.itemId = m.id AND bs.itemType = 'material' AND bs.branchId = ?
    `;
    const params: any[] = [branchId];

    if (category) {
      query += ' WHERE m.category = ?';
      params.push(category);
    }

    query += ' ORDER BY m.name';

    const materials = db.prepare(query).all(...params);

    return NextResponse.json({ materials });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials');
  }
}

export async function POST(request: NextRequest) {
  try {
    const branchId = getBranchIdFromRequest(request);
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

    // upsertMaterial seeds BranchStock at 0, so apply any entered opening stock
    // to this branch's BranchStock (the source of truth the list reads from).
    const openingStock = parseFloat(stockQuantity || 0);
    if (!Number.isNaN(openingStock) && openingStock > 0) {
      const newStock = adjustBranchStock(branchId, 'material', material.id, openingStock);
      logStockMovement({
        itemType: 'material',
        itemId: material.id,
        itemName: material.name,
        movementType: 'manual_adjustment',
        quantityChange: openingStock,
        stockBefore: 0,
        stockAfter: newStock,
        referenceNote: 'Opening stock on material creation',
      });
    }

    return NextResponse.json({ material });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials');
  }
}
