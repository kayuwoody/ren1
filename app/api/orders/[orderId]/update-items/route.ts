import { NextResponse } from 'next/server';
import { db } from '@/lib/db/init';
import { handleApiError, validationError } from '@/lib/api/error-handler';
import { getProductByWcId } from '@/lib/db/productService';
import { v4 as uuidv4 } from 'uuid';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params;
    const { line_items } = await req.json();

    if (!line_items || !Array.isArray(line_items)) {
      return validationError('line_items array required', '/api/orders/[orderId]/update-items');
    }

    const existing = db.prepare('SELECT * FROM "Order" WHERE id = ?').get(orderId) as any;
    if (!existing) {
      return validationError('Order not found', '/api/orders/[orderId]/update-items');
    }
    if (existing.status !== 'pending') {
      return validationError('Can only update pending orders', '/api/orders/[orderId]/update-items');
    }

    const now = new Date().toISOString();
    const branchId = existing.branchId || 'branch-main';

    const replaceItems = db.transaction(() => {
      db.prepare('DELETE FROM OrderItem WHERE orderId = ?').run(orderId);

      let subtotal = 0;
      let totalCost = 0;
      const insertItem = db.prepare(`
        INSERT INTO OrderItem (id, orderId, productId, productName, category, sku,
                               quantity, basePrice, unitPrice, subtotal, unitCost, totalCost,
                               itemProfit, itemMargin, variations, discountApplied, finalPrice,
                               branchId, soldAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of line_items) {
        const product = getProductByWcId(item.product_id);
        const qty = item.quantity || 1;
        const price = parseFloat(item.price || product?.basePrice || '0');
        const lineTotal = price * qty;
        const unitCost = product?.unitCost || 0;
        const lineCost = unitCost * qty;
        subtotal += lineTotal;
        totalCost += lineCost;

        insertItem.run(
          uuidv4(), orderId,
          product?.id || String(item.product_id),
          product?.name || item.name || 'Unknown',
          product?.category || '', product?.sku || '',
          qty, price, price, lineTotal, unitCost, lineCost,
          lineTotal - lineCost,
          lineTotal > 0 ? ((lineTotal - lineCost) / lineTotal) * 100 : 0,
          null, 0, price, branchId, now,
        );
      }

      const totalProfit = subtotal - totalCost;
      const margin = subtotal > 0 ? (totalProfit / subtotal) * 100 : 0;
      db.prepare(`
        UPDATE "Order" SET subtotal = ?, total = ?, totalCost = ?, totalProfit = ?,
                           overallMargin = ?, updatedAt = ? WHERE id = ?
      `).run(subtotal, subtotal, totalCost, totalProfit, margin, now, orderId);
    });

    replaceItems();

    const updated = db.prepare('SELECT * FROM "Order" WHERE id = ?').get(orderId) as any;
    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, '/api/orders/[orderId]/update-items');
  }
}
