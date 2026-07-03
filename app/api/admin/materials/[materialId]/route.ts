import { NextRequest, NextResponse } from 'next/server';
import { getMaterial, upsertMaterial, deleteMaterial, updateMaterialPrice } from '@/lib/db/materialService';
import { recalculateRecipeCostsForMaterial } from '@/lib/db/recipeService';
import { adjustBranchStock, getBranchStock } from '@/lib/db/branchStockService';
import { logStockMovement } from '@/lib/db/stockMovementService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const { materialId } = await params;
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
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const { materialId } = await params;
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

    const priceChanged = purchaseQuantity !== existing.purchaseQuantity ||
                        purchaseCost !== existing.purchaseCost;

    let material;
    if (priceChanged) {
      material = updateMaterialPrice(
        materialId,
        parseFloat(purchaseQuantity),
        parseFloat(purchaseCost),
        'Price updated via admin'
      );

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

      recalculateRecipeCostsForMaterial(materialId);
    } else {
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const { materialId } = await params;
    const branchId = getBranchIdFromRequest(request);
    const body = await request.json();
    const { action } = body;

    if (action !== 'add_stock') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const material = getMaterial(materialId);
    if (!material) {
      return notFoundError('Material not found', '/api/admin/materials/[materialId]');
    }

    const addQty = parseFloat(body.quantity);
    const addCost = parseFloat(body.totalCost);
    if (!addQty || addQty <= 0 || !addCost || addCost < 0) {
      return NextResponse.json({ error: 'Invalid quantity or cost' }, { status: 400 });
    }

    const currentStock = getBranchStock(branchId, 'material', materialId);
    const newCostPerUnit = addCost / addQty;

    let avgCostPerUnit: number;
    if (currentStock > 0) {
      avgCostPerUnit = (currentStock * material.costPerUnit + addQty * newCostPerUnit) / (currentStock + addQty);
    } else {
      avgCostPerUnit = newCostPerUnit;
    }

    const newStock = adjustBranchStock(branchId, 'material', materialId, addQty);

    logStockMovement({
      itemType: 'material',
      itemId: materialId,
      itemName: material.name,
      movementType: 'po_received',
      quantityChange: addQty,
      stockBefore: currentStock,
      stockAfter: newStock,
      referenceNote: `Added ${addQty}${material.purchaseUnit} @ RM ${addCost.toFixed(2)} (RM ${newCostPerUnit.toFixed(4)}/${material.purchaseUnit})`,
    });

    const avgPurchaseCost = avgCostPerUnit * material.purchaseQuantity;
    updateMaterialPrice(materialId, material.purchaseQuantity, avgPurchaseCost, `Weighted average after restock: ${addQty}${material.purchaseUnit} @ RM ${addCost.toFixed(2)}`);
    recalculateRecipeCostsForMaterial(materialId);

    const updated = getMaterial(materialId);

    return NextResponse.json({
      material: updated,
      previousCostPerUnit: material.costPerUnit,
      newCostPerUnit: avgCostPerUnit,
      stockAdded: addQty,
      newStock,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/materials/[materialId]');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ materialId: string }> }
) {
  try {
    const { materialId } = await params;

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
