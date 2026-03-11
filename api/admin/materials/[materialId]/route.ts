/**
 * API Route: Single Material Operations
 * GET /api/admin/materials/[id] - Get material
 * PUT /api/admin/materials/[id] - Update material
 * DELETE /api/admin/materials/[id] - Delete material
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMaterial, upsertMaterial, deleteMaterial, updateMaterialPrice } from '@/lib/db/materialService';
import { recalculateRecipeCostsForMaterial } from '@/lib/db/recipeService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { materialId: string } }
) {
  try {
    const { materialId } = params;
    const material = getMaterial(materialId);

    if (!material) {
      return notFoundError('Material not found', '/api/admin/materials/[materialId]');
    }

    return NextResponse.json({ material });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials/[materialId]');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { materialId: string } }
) {
  try {
    const { materialId } = params;
    const body = await request.json();

    const existing = getMaterial(materialId);
    if (!existing) {
      return notFoundError('Material not found', '/api/admin/materials/[materialId]');
    }

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

    // Check if price changed
    const priceChanged = purchaseQuantity !== existing.purchaseQuantity ||
                        purchaseCost !== existing.purchaseCost;

    let material;
    if (priceChanged) {
      // Use updateMaterialPrice to track history
      material = updateMaterialPrice(
        materialId,
        parseFloat(purchaseQuantity),
        parseFloat(purchaseCost),
        'Price updated via admin'
      );

      // Update other fields
      material = upsertMaterial({
        id: materialId,
        name,
        category,
        purchaseUnit,
        purchaseQuantity: parseFloat(purchaseQuantity),
        purchaseCost: parseFloat(purchaseCost),
        stockQuantity: parseFloat(stockQuantity || 0),
        lowStockThreshold: parseFloat(lowStockThreshold || 0),
        supplier,
      });

      // Recalculate all recipes using this material
      recalculateRecipeCostsForMaterial(materialId);
    } else {
      // No price change, just update
      material = upsertMaterial({
        id: materialId,
        name,
        category,
        purchaseUnit,
        purchaseQuantity: parseFloat(purchaseQuantity),
        purchaseCost: parseFloat(purchaseCost),
        stockQuantity: parseFloat(stockQuantity || 0),
        lowStockThreshold: parseFloat(lowStockThreshold || 0),
        supplier,
      });
    }

    return NextResponse.json({
      material,
      priceChanged,
      message: priceChanged ? 'Material updated and recipes recalculated' : 'Material updated'
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials/[materialId]');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { materialId: string } }
) {
  try {
    const { materialId } = params;

    const material = getMaterial(materialId);
    if (!material) {
      return notFoundError('Material not found', '/api/admin/materials/[materialId]');
    }

    deleteMaterial(materialId);

    return NextResponse.json({
      success: true,
      message: 'Material deleted successfully'
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials/[materialId]');
  }
}
