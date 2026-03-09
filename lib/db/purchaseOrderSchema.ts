/**
 * Purchase Order Schema Migration
 *
 * Adds tables for managing supplier purchase orders:
 * - PurchaseOrder: Main PO table with supplier, dates, totals
 * - PurchaseOrderItem: Line items (materials or products to order)
 */

import { db } from './init';

export function initPurchaseOrderTables() {
  // Purchase Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS PurchaseOrder (
      id TEXT PRIMARY KEY,
      poNumber TEXT NOT NULL UNIQUE,
      supplier TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      totalAmount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      orderDate TEXT,
      expectedDeliveryDate TEXT,
      receivedDate TEXT,
      branchId TEXT REFERENCES Branch(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: Add branchId to PurchaseOrder table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(PurchaseOrder)").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to PurchaseOrder table...');
      db.exec(`ALTER TABLE PurchaseOrder ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE PurchaseOrder SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to PurchaseOrder table');
    }
  } catch (e) { /* column already exists */ }

  // Migration: Add branchId to PurchaseOrderItem table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(PurchaseOrderItem)").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to PurchaseOrderItem table...');
      db.exec(`ALTER TABLE PurchaseOrderItem ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE PurchaseOrderItem SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to PurchaseOrderItem table');
    }
  } catch (e) { /* column already exists */ }

  // Purchase Order Items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS PurchaseOrderItem (
      id TEXT PRIMARY KEY,
      purchaseOrderId TEXT NOT NULL,
      itemType TEXT NOT NULL DEFAULT 'material',
      materialId TEXT,
      productId TEXT,
      materialName TEXT,
      productName TEXT,
      sku TEXT,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unitCost REAL NOT NULL,
      totalCost REAL NOT NULL,
      receivedQuantity REAL NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (purchaseOrderId) REFERENCES PurchaseOrder(id) ON DELETE CASCADE,
      FOREIGN KEY (materialId) REFERENCES Material(id),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );
  `);

  // Indexes for purchase orders
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_purchase_order_number ON PurchaseOrder(poNumber);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_supplier ON PurchaseOrder(supplier);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_status ON PurchaseOrder(status);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_date ON PurchaseOrder(orderDate);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_branch ON PurchaseOrder(branchId);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_item_po ON PurchaseOrderItem(purchaseOrderId);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_item_material ON PurchaseOrderItem(materialId);
    CREATE INDEX IF NOT EXISTS idx_purchase_order_item_product ON PurchaseOrderItem(productId);
  `);
}

/**
 * Generate next PO number
 * Format: {BRANCH_CODE}-PO-YYYY-MM-NNNN (e.g., MAIN-PO-2026-03-0001)
 */
export function generatePONumber(branchCode: string = 'MAIN'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  // Get the latest PO number for this branch+month to avoid collisions
  const prefix = `${branchCode}-PO-${year}-${month}-`;
  const latest = db.prepare(`
    SELECT poNumber FROM PurchaseOrder
    WHERE poNumber LIKE ?
    ORDER BY poNumber DESC
    LIMIT 1
  `).get(`${prefix}%`) as { poNumber?: string } | undefined;

  let sequence = 1;
  if (latest?.poNumber) {
    const lastSequence = parseInt(latest.poNumber.split('-').pop() || '0', 10);
    sequence = lastSequence + 1;
  }

  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  totalAmount: number;
  notes?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  receivedDate?: string;
  branchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  itemType: 'material' | 'product';
  materialId?: string;
  productId?: string;
  materialName?: string;
  productName?: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  receivedQuantity: number;
  notes?: string;
  createdAt: string;
}

export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
}
