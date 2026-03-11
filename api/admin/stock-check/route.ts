import { NextResponse } from 'next/server';
import { getAllProducts, getProduct } from '@/lib/db/productService';
import { getAllMaterials, getMaterial } from '@/lib/db/materialService';
import { createStockCheckLog } from '@/lib/db/stockCheckLogService';
import { updateBranchStock, syncLegacyStockColumns } from '@/lib/db/branchStockService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export interface StockCheckItem {
  id: string;
  type: 'product' | 'material';
  name: string;
  sku?: string;
  category: string;
  supplier: string;
  currentStock: number;
  unit: string;
  lowStockThreshold?: number;
}

/**
 * GET /api/admin/stock-check
 */
export async function GET() {
  try {
    const products = getAllProducts();
    const materials = getAllMaterials();

    const items: StockCheckItem[] = [];

    for (const product of products) {
      if (product.manageStock) {
        items.push({
          id: product.id,
          type: 'product',
          name: product.name,
          sku: product.sku,
          category: product.category,
          supplier: product.supplier || 'Unassigned',
          currentStock: product.stockQuantity,
          unit: 'pcs',
        });
      }
    }

    for (const material of materials) {
      items.push({
        id: material.id,
        type: 'material',
        name: material.name,
        category: material.category,
        supplier: material.supplier || 'Unassigned',
        currentStock: material.stockQuantity,
        unit: material.purchaseUnit,
        lowStockThreshold: material.lowStockThreshold,
      });
    }

    items.sort((a, b) => {
      if (a.supplier !== b.supplier) {
        if (a.supplier === 'Unassigned') return 1;
        if (b.supplier === 'Unassigned') return -1;
        return a.supplier.localeCompare(b.supplier);
      }
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ items });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check');
  }
}

interface StockUpdateItem {
  id: string;
  type: 'product' | 'material';
  countedStock: number;
  note?: string;
}

/**
 * POST /api/admin/stock-check
 *
 * Update stock levels via BranchStock. Legacy columns synced at the end.
 */
export async function POST(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { updates } = await req.json() as { updates: StockUpdateItem[] };

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Invalid request: updates array required' },
        { status: 400 }
      );
    }

    const results: { id: string; name: string; success: boolean; error?: string }[] = [];
    const logItems: {
      itemType: 'product' | 'material';
      itemId: string;
      itemName: string;
      supplier?: string;
      previousStock: number;
      countedStock: number;
      unit: string;
      note?: string;
    }[] = [];

    for (const update of updates) {
      try {
        if (update.type === 'product') {
          const product = getProduct(update.id);
          if (!product) {
            results.push({ id: update.id, name: 'Unknown', success: false, error: 'Product not found' });
            continue;
          }

          const previousStock = product.stockQuantity;
          updateBranchStock(branchId, 'product', update.id, update.countedStock);
          console.log(`✅ Stock check: Updated BranchStock for ${product.name}: ${previousStock} → ${update.countedStock}`);

          results.push({ id: update.id, name: product.name, success: true });
          logItems.push({
            itemType: 'product',
            itemId: update.id,
            itemName: product.name,
            supplier: product.supplier,
            previousStock,
            countedStock: update.countedStock,
            unit: 'pcs',
            note: update.note,
          });

        } else if (update.type === 'material') {
          const material = getMaterial(update.id);
          if (!material) {
            results.push({ id: update.id, name: 'Unknown', success: false, error: 'Material not found' });
            continue;
          }

          const previousStock = material.stockQuantity;
          updateBranchStock(branchId, 'material', update.id, update.countedStock);
          console.log(`✅ Stock check: Updated BranchStock for ${material.name}: ${previousStock} → ${update.countedStock}`);

          results.push({ id: update.id, name: material.name, success: true });
          logItems.push({
            itemType: 'material',
            itemId: update.id,
            itemName: material.name,
            supplier: material.supplier,
            previousStock,
            countedStock: update.countedStock,
            unit: material.purchaseUnit,
            note: update.note,
          });

        } else {
          results.push({ id: update.id, name: 'Unknown', success: false, error: 'Invalid item type' });
        }
      } catch (err) {
        results.push({
          id: update.id,
          name: 'Unknown',
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    // Sync legacy columns as batch safety net
    syncLegacyStockColumns();

    let logId: string | undefined;
    if (logItems.length > 0) {
      const log = createStockCheckLog({ items: logItems });
      logId = log.id;
      console.log(`📋 Stock check log created: ${logId} (${logItems.length} items)`);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      message: `Updated ${successCount} items${failCount > 0 ? `, ${failCount} failed` : ''}`,
      results,
      logId,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check');
  }
}
