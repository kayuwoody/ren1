/**
 * Purchase Order Service
 *
 * CRUD operations for managing supplier purchase orders
 */

import { db } from './init';
import { v4 as uuidv4 } from 'uuid';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderWithItems,
  generatePONumber,
} from './purchaseOrderSchema';
import { wcApi } from '../wooClient';

interface CreatePurchaseOrderInput {
  supplier: string;
  notes?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  items: Array<{
    itemType: 'material' | 'product';
    materialId?: string;
    productId?: string;
    quantity: number;
    unit: string;
    unitCost: number;
    notes?: string;
  }>;
}

interface UpdatePurchaseOrderInput {
  supplier?: string;
  status?: 'draft' | 'ordered' | 'received' | 'cancelled';
  notes?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  receivedDate?: string;
}

/**
 * Create a new purchase order
 */
export function createPurchaseOrder(input: CreatePurchaseOrderInput): PurchaseOrderWithItems {
  const id = uuidv4();
  const poNumber = generatePONumber();
  const now = new Date().toISOString();

  // Calculate total amount
  let totalAmount = 0;
  const items: PurchaseOrderItem[] = [];

  // Process items and fetch material/product details
  for (const itemInput of input.items) {
    const itemId = uuidv4();
    const totalCost = itemInput.quantity * itemInput.unitCost;
    totalAmount += totalCost;

    let materialName: string | undefined;
    let productName: string | undefined;
    let sku: string | undefined;

    if (itemInput.itemType === 'material' && itemInput.materialId) {
      const material = db.prepare('SELECT name FROM Material WHERE id = ?').get(itemInput.materialId) as { name: string } | undefined;
      materialName = material?.name;
    } else if (itemInput.itemType === 'product' && itemInput.productId) {
      const product = db.prepare('SELECT name, sku FROM Product WHERE id = ?').get(itemInput.productId) as { name: string; sku: string } | undefined;
      productName = product?.name;
      sku = product?.sku;
    }

    const item: PurchaseOrderItem = {
      id: itemId,
      purchaseOrderId: id,
      itemType: itemInput.itemType,
      materialId: itemInput.materialId,
      productId: itemInput.productId,
      materialName,
      productName,
      sku,
      quantity: itemInput.quantity,
      unit: itemInput.unit,
      unitCost: itemInput.unitCost,
      totalCost,
      receivedQuantity: 0,
      notes: itemInput.notes,
      createdAt: now,
    };

    items.push(item);
  }

  // Insert purchase order
  db.prepare(`
    INSERT INTO PurchaseOrder (id, poNumber, supplier, status, totalAmount, notes, orderDate, expectedDeliveryDate, createdAt, updatedAt)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    poNumber,
    input.supplier,
    totalAmount,
    input.notes || null,
    input.orderDate || null,
    input.expectedDeliveryDate || null,
    now,
    now
  );

  // Insert items
  const insertItem = db.prepare(`
    INSERT INTO PurchaseOrderItem (id, purchaseOrderId, itemType, materialId, productId, materialName, productName, sku, quantity, unit, unitCost, totalCost, receivedQuantity, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  for (const item of items) {
    insertItem.run(
      item.id,
      item.purchaseOrderId,
      item.itemType,
      item.materialId || null,
      item.productId || null,
      item.materialName || null,
      item.productName || null,
      item.sku || null,
      item.quantity,
      item.unit,
      item.unitCost,
      item.totalCost,
      item.notes || null,
      item.createdAt
    );
  }

  return {
    id,
    poNumber,
    supplier: input.supplier,
    status: 'draft',
    totalAmount,
    notes: input.notes,
    orderDate: input.orderDate,
    expectedDeliveryDate: input.expectedDeliveryDate,
    receivedDate: undefined,
    createdAt: now,
    updatedAt: now,
    items,
  };
}

/**
 * Get all purchase orders
 */
export function getAllPurchaseOrders(): PurchaseOrderWithItems[] {
  const orders = db.prepare('SELECT * FROM PurchaseOrder ORDER BY createdAt DESC').all() as PurchaseOrder[];

  return orders.map(order => {
    const items = db.prepare('SELECT * FROM PurchaseOrderItem WHERE purchaseOrderId = ?').all(order.id) as PurchaseOrderItem[];
    return { ...order, items };
  });
}

/**
 * Get a single purchase order by ID
 */
export function getPurchaseOrder(id: string): PurchaseOrderWithItems | null {
  const order = db.prepare('SELECT * FROM PurchaseOrder WHERE id = ?').get(id) as PurchaseOrder | undefined;

  if (!order) return null;

  const items = db.prepare('SELECT * FROM PurchaseOrderItem WHERE purchaseOrderId = ?').all(id) as PurchaseOrderItem[];

  return { ...order, items };
}

/**
 * Get a purchase order by PO number
 */
export function getPurchaseOrderByNumber(poNumber: string): PurchaseOrderWithItems | null {
  const order = db.prepare('SELECT * FROM PurchaseOrder WHERE poNumber = ?').get(poNumber) as PurchaseOrder | undefined;

  if (!order) return null;

  const items = db.prepare('SELECT * FROM PurchaseOrderItem WHERE purchaseOrderId = ?').all(order.id) as PurchaseOrderItem[];

  return { ...order, items };
}

/**
 * Update a purchase order
 */
export function updatePurchaseOrder(id: string, updates: UpdatePurchaseOrderInput): PurchaseOrderWithItems | null {
  const order = getPurchaseOrder(id);
  if (!order) return null;

  const now = new Date().toISOString();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.supplier !== undefined) {
    fields.push('supplier = ?');
    values.push(updates.supplier);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);

    // Auto-set receivedDate when status changes to 'received'
    if (updates.status === 'received' && !order.receivedDate) {
      fields.push('receivedDate = ?');
      values.push(now);
    }
  }
  if (updates.notes !== undefined) {
    fields.push('notes = ?');
    values.push(updates.notes);
  }
  if (updates.orderDate !== undefined) {
    fields.push('orderDate = ?');
    values.push(updates.orderDate);
  }
  if (updates.expectedDeliveryDate !== undefined) {
    fields.push('expectedDeliveryDate = ?');
    values.push(updates.expectedDeliveryDate);
  }
  if (updates.receivedDate !== undefined) {
    fields.push('receivedDate = ?');
    values.push(updates.receivedDate);
  }

  if (fields.length === 0) return order;

  fields.push('updatedAt = ?');
  values.push(now);
  values.push(id);

  db.prepare(`UPDATE PurchaseOrder SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getPurchaseOrder(id);
}

/**
 * Add stock to WooCommerce product (when receiving inventory)
 */
async function addWooProductStock(wcProductId: number, quantity: number, productName: string): Promise<void> {
  try {
    // Fetch current product from WooCommerce
    const response = await wcApi.get(`products/${wcProductId}`);
    const product = (response as any).data;

    // Check if product manages stock
    if (!product.manage_stock) {
      console.log(`   ℹ️  Product "${productName}" does not manage stock in WooCommerce - skipping inventory update`);
      return;
    }

    const currentStock = product.stock_quantity || 0;
    const newStock = currentStock + quantity;

    console.log(`   📦 WooCommerce Inventory (Receiving): ${productName} (${currentStock} → ${newStock})`);

    // Update WooCommerce product stock
    await wcApi.put(`products/${wcProductId}`, {
      stock_quantity: newStock
    });

  } catch (error: any) {
    console.error(`   ❌ Failed to update WooCommerce stock for ${productName}:`, error.message);
    // Don't fail the whole operation if WooCommerce update fails
  }
}

/**
 * Mark a purchase order as received and update inventory
 * Updates both local database AND WooCommerce stock levels
 */
export async function markPurchaseOrderReceived(id: string): Promise<PurchaseOrderWithItems | null> {
  const order = getPurchaseOrder(id);
  if (!order) return null;

  const now = new Date().toISOString();

  // Update PO status
  db.prepare('UPDATE PurchaseOrder SET status = ?, receivedDate = ?, updatedAt = ? WHERE id = ?')
    .run('received', now, now, id);

  // Update received quantities to match ordered quantities
  db.prepare('UPDATE PurchaseOrderItem SET receivedQuantity = quantity WHERE purchaseOrderId = ?')
    .run(id);

  console.log(`📦 Receiving PO ${order.poNumber} - Updating inventory...`);

  // Update inventory for materials and products
  for (const item of order.items) {
    if (item.itemType === 'material' && item.materialId) {
      // Update local material stock
      db.prepare('UPDATE Material SET stockQuantity = stockQuantity + ? WHERE id = ?')
        .run(item.quantity, item.materialId);
      console.log(`   ✅ Material: ${item.materialName} +${item.quantity} ${item.unit}`);
    } else if (item.itemType === 'product' && item.productId) {
      // Update local product stock
      db.prepare('UPDATE Product SET stockQuantity = stockQuantity + ? WHERE id = ?')
        .run(item.quantity, item.productId);
      console.log(`   ✅ Local Product: ${item.productName} +${item.quantity}`);

      // Update WooCommerce stock if product has wcId
      const product = db.prepare('SELECT wcId, name FROM Product WHERE id = ?').get(item.productId) as { wcId?: number; name: string } | undefined;
      if (product?.wcId) {
        await addWooProductStock(product.wcId, item.quantity, product.name);
      } else {
        console.log(`   ℹ️  Product "${item.productName}" has no WooCommerce ID - skipping WooCommerce sync`);
      }
    }
  }

  console.log(`✅ PO ${order.poNumber} marked as received and inventory updated`);

  return getPurchaseOrder(id);
}

/**
 * Delete a purchase order (only if status is 'draft')
 */
export function deletePurchaseOrder(id: string): boolean {
  const order = getPurchaseOrder(id);
  if (!order) return false;

  if (order.status !== 'draft') {
    throw new Error('Only draft purchase orders can be deleted');
  }

  db.prepare('DELETE FROM PurchaseOrder WHERE id = ?').run(id);
  return true;
}

/**
 * Get suppliers from existing materials
 */
export function getSuppliers(): string[] {
  const results = db.prepare('SELECT DISTINCT supplier FROM Material WHERE supplier IS NOT NULL ORDER BY supplier').all() as Array<{ supplier: string }>;
  return results.map(r => r.supplier);
}
