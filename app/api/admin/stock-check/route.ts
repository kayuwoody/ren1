import { NextResponse } from 'next/server';
import { getAllProducts, getProduct } from '@/lib/db/productService';
import { getAllMaterials, getMaterial, updateMaterialStock } from '@/lib/db/materialService';
import { createStockCheckLog } from '@/lib/db/stockCheckLogService';
import { db } from '@/lib/db/init';
import { wcApi } from '@/lib/wooClient';
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
 *
 * Get all items (products and materials) for stock checking
 */
export async function GET() {
  try {
    const products = getAllProducts();
    const materials = getAllMaterials();

    const items: StockCheckItem[] = [];

    // Add products that have stock management enabled
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

    // Add all materials
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

    // Sort by supplier, then by category, then by name
    items.sort((a, b) => {
      if (a.supplier !== b.supplier) {
        // Put "Unassigned" at the end
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
 * Update stock levels for multiple items
 * Reuses existing stock update logic including WooCommerce sync for products
 * Creates a log entry for audit trail
 */
export async function POST(req: Request) {
  try {
    const { updates } = await req.json() as { updates: StockUpdateItem[] };

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json(
        { error: 'Invalid request: updates array required' },
        { status: 400 }
      );
    }

    const results: { id: string; name: string; success: boolean; wcSynced?: boolean; error?: string }[] = [];
    const logItems: {
      itemType: 'product' | 'material';
      itemId: string;
      itemName: string;
      supplier?: string;
      previousStock: number;
      countedStock: number;
      unit: string;
      note?: string;
      wcSynced?: boolean;
    }[] = [];

    for (const update of updates) {
      try {
        if (update.type === 'product') {
          // Reuse same logic as /api/products/update-stock
          const product = db.prepare('SELECT id, wcId, name, manageStock, stockQuantity, supplier FROM Product WHERE id = ?').get(update.id) as {
            id: string;
            wcId?: number;
            name: string;
            manageStock: number;
            stockQuantity: number;
            supplier?: string;
          } | undefined;

          if (!product) {
            results.push({ id: update.id, name: 'Unknown', success: false, error: 'Product not found' });
            continue;
          }

          const previousStock = product.stockQuantity;

          // Update local database
          db.prepare('UPDATE Product SET stockQuantity = ?, updatedAt = ? WHERE id = ?')
            .run(update.countedStock, new Date().toISOString(), update.id);
          console.log(`✅ Stock check: Updated local stock for ${product.name}: ${previousStock} → ${update.countedStock}`);

          // Update WooCommerce if product has wcId and manages stock
          let wcSynced = false;
          if (product.wcId && product.manageStock) {
            try {
              await wcApi.put(`products/${product.wcId}`, {
                stock_quantity: update.countedStock,
              });
              console.log(`✅ Stock check: Updated WooCommerce stock for ${product.name}: ${update.countedStock}`);
              wcSynced = true;
            } catch (wcError: any) {
              console.error(`❌ Stock check: Failed to update WooCommerce stock for ${product.name}:`, wcError.message);
            }
          }

          results.push({ id: update.id, name: product.name, success: true, wcSynced });

          // Add to log items
          logItems.push({
            itemType: 'product',
            itemId: update.id,
            itemName: product.name,
            supplier: product.supplier,
            previousStock,
            countedStock: update.countedStock,
            unit: 'pcs',
            note: update.note,
            wcSynced,
          });

        } else if (update.type === 'material') {
          const material = getMaterial(update.id);
          if (!material) {
            results.push({ id: update.id, name: 'Unknown', success: false, error: 'Material not found' });
            continue;
          }

          const previousStock = material.stockQuantity;

          // Reuse existing updateMaterialStock from materialService
          updateMaterialStock(update.id, update.countedStock);
          console.log(`✅ Stock check: Updated material stock for ${material.name}: ${previousStock} → ${update.countedStock}`);
          results.push({ id: update.id, name: material.name, success: true });

          // Add to log items
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

    // Create stock check log if there were successful updates
    let logId: string | undefined;
    if (logItems.length > 0) {
      const log = createStockCheckLog({ items: logItems });
      logId = log.id;
      console.log(`📋 Stock check log created: ${logId} (${logItems.length} items)`);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const wcSyncCount = results.filter(r => r.wcSynced).length;

    return NextResponse.json({
      message: `Updated ${successCount} items${failCount > 0 ? `, ${failCount} failed` : ''}${wcSyncCount > 0 ? `, ${wcSyncCount} synced to WooCommerce` : ''}`,
      results,
      logId,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/stock-check');
  }
}
