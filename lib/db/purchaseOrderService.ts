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
import { adjustBranchStock, syncLegacyStockColumns, getBranchStock } from './branchStockService';
import { logStockMovement } from './stockMovementService';

interface CreatePurchaseOrderInput {
  supplier: string;
  notes?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  branchId?: string;
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
  status?: 'draft' | 'ordered' | 'partial' | 'received' | 'cancelled';
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

  // Look up branch code for PO number prefix
  const branchRecord = input.branchId
    ? (db.prepare('SELECT code FROM Branch WHERE id = ?').get(input.branchId) as { code: string } | undefined)
    : undefined;
  const branchCode = branchRecord?.code || 'MAIN';
  const poNumber = generatePONumber(branchCode);
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
      const product = db.prepare('SELECT name, supplierProductName, sku FROM Product WHERE id = ?').get(itemInput.productId) as { name: string; supplierProductName?: string; sku: string } | undefined;
      productName = product?.supplierProductName || product?.name;
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
    INSERT INTO PurchaseOrder (id, poNumber, supplier, status, totalAmount, notes, orderDate, expectedDeliveryDate, branchId, createdAt, updatedAt)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    poNumber,
    input.supplier,
    totalAmount,
    input.notes || null,
    input.orderDate || null,
    input.expectedDeliveryDate || null,
    input.branchId || 'branch-main',
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
 * Get all purchase orders, optionally filtered by branch
 */
export function getAllPurchaseOrders(branchId?: string): PurchaseOrderWithItems[] {
  const orders = branchId
    ? db.prepare('SELECT * FROM PurchaseOrder WHERE branchId = ? ORDER BY createdAt DESC').all(branchId) as PurchaseOrder[]
    : db.prepare('SELECT * FROM PurchaseOrder ORDER BY createdAt DESC').all() as PurchaseOrder[];

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
 * Mark a purchase order as received and update inventory.
 *
 * `receivedItems` optionally sets the *cumulative* received quantity per line
 * (e.g. a short or staged delivery). Stock is adjusted by the delta from what
 * was already received, so calling this again to top up a partial PO only adds
 * the newly-arrived amount. When omitted, every line is received in full
 * (backward-compatible with the old one-click behaviour).
 *
 * The PO closes as 'received' once every line's received quantity reaches its
 * ordered quantity; otherwise it is left 'partial' so the rest can be received
 * later.
 */
export async function markPurchaseOrderReceived(
  id: string,
  receivedItems?: Array<{ itemId: string; receivedQuantity: number }>,
): Promise<PurchaseOrderWithItems | null> {
  const order = getPurchaseOrder(id);
  if (!order) return null;

  const now = new Date().toISOString();
  const branchId = order.branchId || 'branch-main';

  // Map itemId -> requested cumulative received quantity (default: full order).
  const requested = new Map<string, number>();
  for (const item of order.items) {
    const override = receivedItems?.find(r => r.itemId === item.id);
    const target = override ? override.receivedQuantity : item.quantity;
    // Clamp to [0, ordered] — can't receive negative or more than ordered.
    requested.set(item.id, Math.max(0, Math.min(target, item.quantity)));
  }

  console.log(`📦 Receiving PO ${order.poNumber} - Updating inventory...`);

  const updateItem = db.prepare('UPDATE PurchaseOrderItem SET receivedQuantity = ? WHERE id = ?');

  // Update BranchStock for each item by the delta received since last time
  // (BranchStock is the source of truth).
  for (const item of order.items) {
    const alreadyReceived = item.receivedQuantity || 0;
    const newReceived = requested.get(item.id) ?? item.quantity;
    const delta = newReceived - alreadyReceived;

    updateItem.run(newReceived, item.id);

    if (delta === 0) continue; // nothing new arrived for this line

    if (item.itemType === 'material' && item.materialId) {
      const stockBefore = getBranchStock(branchId, 'material', item.materialId);
      adjustBranchStock(branchId, 'material', item.materialId, delta);
      console.log(`   ✅ Material: ${item.materialName} ${delta >= 0 ? '+' : ''}${delta} ${item.unit}`);

      logStockMovement({
        itemType: 'material',
        itemId: item.materialId,
        itemName: item.materialName || 'Unknown',
        movementType: 'po_received',
        quantityChange: delta,
        stockBefore,
        stockAfter: stockBefore + delta,
        referenceId: order.id,
        referenceNote: `PO: ${order.poNumber}`,
      });
    } else if (item.itemType === 'product' && item.productId) {
      const stockBefore = getBranchStock(branchId, 'product', item.productId);
      adjustBranchStock(branchId, 'product', item.productId, delta);
      console.log(`   ✅ Product: ${item.productName} ${delta >= 0 ? '+' : ''}${delta}`);

      logStockMovement({
        itemType: 'product',
        itemId: item.productId,
        itemName: item.productName || 'Unknown',
        movementType: 'po_received',
        quantityChange: delta,
        stockBefore,
        stockAfter: stockBefore + delta,
        referenceId: order.id,
        referenceNote: `PO: ${order.poNumber}`,
      });
    }
  }

  // Fully received if every line reached its ordered quantity, else partial.
  const fullyReceived = order.items.every(
    item => (requested.get(item.id) ?? item.quantity) >= item.quantity,
  );
  const newStatus = fullyReceived ? 'received' : 'partial';

  // Only stamp receivedDate once fully received; keep it clear while partial.
  if (fullyReceived) {
    db.prepare('UPDATE PurchaseOrder SET status = ?, receivedDate = ?, updatedAt = ? WHERE id = ?')
      .run(newStatus, now, now, id);
  } else {
    db.prepare('UPDATE PurchaseOrder SET status = ?, updatedAt = ? WHERE id = ?')
      .run(newStatus, now, id);
  }

  // Sync legacy columns as aggregate totals across all branches (safety net)
  syncLegacyStockColumns();

  console.log(`✅ PO ${order.poNumber} marked as ${newStatus} and inventory updated`);

  return getPurchaseOrder(id);
}

/**
 * Update purchase order items (for draft orders only)
 */
export function updatePurchaseOrderItems(
  id: string,
  items: Array<{
    itemType: 'material' | 'product';
    materialId?: string;
    productId?: string;
    quantity: number;
    unit: string;
    unitCost: number;
    notes?: string;
  }>
): PurchaseOrderWithItems | null {
  const order = getPurchaseOrder(id);
  if (!order) return null;

  if (order.status !== 'draft') {
    throw new Error('Only draft purchase orders can be edited');
  }

  const now = new Date().toISOString();

  // Delete existing items
  db.prepare('DELETE FROM PurchaseOrderItem WHERE purchaseOrderId = ?').run(id);

  // Calculate total amount and insert new items
  let totalAmount = 0;

  for (const itemInput of items) {
    const itemId = uuidv4();
    const totalCost = itemInput.quantity * itemInput.unitCost;
    totalAmount += totalCost;

    let materialName: string | undefined;
    let productName: string | undefined;
    let sku: string | undefined;

    if (itemInput.itemType === 'material' && itemInput.materialId) {
      const material = db
        .prepare('SELECT name FROM Material WHERE id = ?')
        .get(itemInput.materialId) as { name: string } | undefined;
      materialName = material?.name;
    } else if (itemInput.itemType === 'product' && itemInput.productId) {
      const product = db
        .prepare('SELECT name, sku FROM Product WHERE id = ?')
        .get(itemInput.productId) as { name: string; sku: string } | undefined;
      productName = product?.name;
      sku = product?.sku;
    }

    db.prepare(`
      INSERT INTO PurchaseOrderItem (
        id, purchaseOrderId, itemType, materialId, productId, materialName, productName, sku,
        quantity, unit, unitCost, totalCost, receivedQuantity, notes, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      itemId,
      id,
      itemInput.itemType,
      itemInput.materialId || null,
      itemInput.productId || null,
      materialName || null,
      productName || null,
      sku || null,
      itemInput.quantity,
      itemInput.unit,
      itemInput.unitCost,
      totalCost,
      itemInput.notes || null,
      now
    );
  }

  // Update total amount
  db.prepare('UPDATE PurchaseOrder SET totalAmount = ?, updatedAt = ? WHERE id = ?').run(
    totalAmount,
    now,
    id
  );

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
  // Get suppliers from both materials and products
  const materialSuppliers = db.prepare('SELECT DISTINCT supplier FROM Material WHERE supplier IS NOT NULL').all() as Array<{ supplier: string }>;
  const productSuppliers = db.prepare('SELECT DISTINCT supplier FROM Product WHERE supplier IS NOT NULL').all() as Array<{ supplier: string }>;

  // Combine and deduplicate
  const allSuppliers = new Set([
    ...materialSuppliers.map(r => r.supplier),
    ...productSuppliers.map(r => r.supplier)
  ]);

  // Return sorted array
  return Array.from(allSuppliers).sort();
}
