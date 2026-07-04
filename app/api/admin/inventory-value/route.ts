import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { buildDateFilter } from '@/lib/db/orderService';
import { getAllMaterials } from '@/lib/db/materialService';
import { getAllProducts } from '@/lib/db/productService';
import { getBranchStock } from '@/lib/db/branchStockService';
import { getBranchIdFromRequest } from '@/lib/api/branchHelper';
import { handleApiError } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/inventory-value
 *
 * Two views of stock cash value:
 *  A. Goods ordered — purchase orders placed in the date range (status
 *     ordered/received, excluding drafts + cancelled), filtered by order date.
 *  B. Current stock value — a live snapshot (no date filter): on-hand quantity
 *     × cost (materials at costPerUnit, stock-managed products at supplierCost,
 *     falling back to unitCost).
 */
export async function GET(req: Request) {
  try {
    const branchId = getBranchIdFromRequest(req);
    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '30days';
    const startDateParam = searchParams.get('start');
    const endDateParam = searchParams.get('end');

    const { startDate, endDate } = buildDateFilter(range, startDateParam, endDateParam);

    // ---- A. Goods ordered (purchase orders) ----
    // Filter by order date (falling back to created date), normalised to the KL
    // calendar day so day-granular PO dates land in the right bucket.
    const orders = db.prepare(`
      SELECT id, poNumber, supplier, status, totalAmount, orderDate, receivedDate, createdAt
      FROM PurchaseOrder
      WHERE status IN ('ordered', 'received')
        AND (branchId = ? OR branchId IS NULL)
        AND date(COALESCE(orderDate, createdAt), '+8 hours') >= date(?, '+8 hours')
        AND date(COALESCE(orderDate, createdAt), '+8 hours') <= date(?, '+8 hours')
      ORDER BY COALESCE(orderDate, createdAt) DESC
    `).all(branchId, startDate, endDate) as Array<{
      id: string; poNumber: string; supplier: string; status: string;
      totalAmount: number; orderDate: string | null; receivedDate: string | null; createdAt: string;
    }>;

    const purchasesTotal = orders.reduce((s, o) => s + o.totalAmount, 0);

    const bySupplierMap: Record<string, { amount: number; count: number }> = {};
    for (const o of orders) {
      const key = o.supplier || 'Unassigned';
      bySupplierMap[key] = bySupplierMap[key] || { amount: 0, count: 0 };
      bySupplierMap[key].amount += o.totalAmount;
      bySupplierMap[key].count += 1;
    }
    const bySupplier = Object.entries(bySupplierMap)
      .map(([supplier, v]) => ({ supplier, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount);

    let byItem: Array<{ name: string; itemType: string; unit: string; quantity: number; cost: number }> = [];
    if (orders.length > 0) {
      const placeholders = orders.map(() => '?').join(', ');
      byItem = db.prepare(`
        SELECT COALESCE(materialName, productName, 'Unknown') AS name,
               itemType, unit,
               SUM(quantity) AS quantity, SUM(totalCost) AS cost
        FROM PurchaseOrderItem
        WHERE purchaseOrderId IN (${placeholders})
        GROUP BY COALESCE(materialId, productId, name), unit
        ORDER BY cost DESC
      `).all(...orders.map(o => o.id)) as typeof byItem;
    }

    // ---- B. Current stock value (snapshot) ----
    const items: Array<{ type: 'material' | 'product'; name: string; unit: string; quantity: number; unitCost: number; value: number }> = [];

    let materialsValue = 0;
    for (const m of getAllMaterials()) {
      const qty = getBranchStock(branchId, 'material', m.id);
      if (qty <= 0) continue;
      const unitCost = m.costPerUnit || 0;
      const value = qty * unitCost;
      materialsValue += value;
      items.push({ type: 'material', name: m.name, unit: m.purchaseUnit, quantity: qty, unitCost, value });
    }

    let productsValue = 0;
    for (const p of getAllProducts()) {
      if (!p.manageStock) continue;
      const qty = getBranchStock(branchId, 'product', p.id);
      if (qty <= 0) continue;
      const unitCost = p.supplierCost || p.unitCost || 0;
      const value = qty * unitCost;
      productsValue += value;
      items.push({ type: 'product', name: p.name, unit: 'pcs', quantity: qty, unitCost, value });
    }

    items.sort((a, b) => b.value - a.value);

    return NextResponse.json({
      purchases: {
        total: purchasesTotal,
        count: orders.length,
        bySupplier,
        byItem,
        orders,
      },
      stock: {
        total: materialsValue + productsValue,
        materialsValue,
        productsValue,
        itemCount: items.length,
        items,
      },
      dateRange: { start: startDate, end: endDate },
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/inventory-value');
  }
}
