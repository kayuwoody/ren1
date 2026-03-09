import { db } from './init';
import { v4 as uuidv4 } from 'uuid';

export interface BranchStock {
  id: string;
  branchId: string;
  itemType: 'material' | 'product';
  itemId: string;
  stockQuantity: number;
  lowStockThreshold: number;
  updatedAt: string;
}

export function getBranchStock(branchId: string, itemType: string, itemId: string): number {
  const row = db.prepare(
    'SELECT stockQuantity FROM BranchStock WHERE branchId = ? AND itemType = ? AND itemId = ?'
  ).get(branchId, itemType, itemId) as { stockQuantity: number } | undefined;
  return row?.stockQuantity ?? 0;
}

export function updateBranchStock(
  branchId: string,
  itemType: string,
  itemId: string,
  quantity: number
): void {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT id FROM BranchStock WHERE branchId = ? AND itemType = ? AND itemId = ?'
  ).get(branchId, itemType, itemId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      'UPDATE BranchStock SET stockQuantity = ?, updatedAt = ? WHERE id = ?'
    ).run(quantity, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(uuidv4(), branchId, itemType, itemId, quantity, now);
  }
}

export function adjustBranchStock(
  branchId: string,
  itemType: string,
  itemId: string,
  delta: number
): number {
  const current = getBranchStock(branchId, itemType, itemId);
  const newQty = current + delta;
  updateBranchStock(branchId, itemType, itemId, newQty);
  return newQty;
}

export function getLowStockItems(branchId: string): BranchStock[] {
  return db.prepare(`
    SELECT * FROM BranchStock
    WHERE branchId = ? AND stockQuantity <= lowStockThreshold AND lowStockThreshold > 0
    ORDER BY itemType, itemId
  `).all(branchId) as BranchStock[];
}

export function getBranchStockForBranch(branchId: string): BranchStock[] {
  return db.prepare(
    'SELECT * FROM BranchStock WHERE branchId = ? ORDER BY itemType, itemId'
  ).all(branchId) as BranchStock[];
}

export function updateLowStockThreshold(
  branchId: string,
  itemType: string,
  itemId: string,
  threshold: number
): void {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE BranchStock SET lowStockThreshold = ?, updatedAt = ?
    WHERE branchId = ? AND itemType = ? AND itemId = ?
  `).run(threshold, now, branchId, itemType, itemId);
}

/**
 * When a new branch is created, seed zero-stock entries for all materials and managed products.
 */
export function initBranchStockForNewBranch(branchId: string): void {
  const now = new Date().toISOString();

  const materials = db.prepare('SELECT id, lowStockThreshold FROM Material').all() as Array<{ id: string; lowStockThreshold: number }>;
  for (const m of materials) {
    db.prepare(`
      INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt)
      VALUES (?, ?, 'material', ?, 0, ?, ?)
    `).run(uuidv4(), branchId, m.id, m.lowStockThreshold, now);
  }

  const products = db.prepare('SELECT id FROM Product WHERE manageStock = 1').all() as Array<{ id: string }>;
  for (const p of products) {
    db.prepare(`
      INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt)
      VALUES (?, ?, 'product', ?, 0, 0, ?)
    `).run(uuidv4(), branchId, p.id, now);
  }
}

/**
 * Sync legacy Material.stockQuantity and Product.stockQuantity columns
 * with the SUM of BranchStock quantities across all branches.
 *
 * Call after PO receiving or stock checks (NOT on every sale — too frequent).
 * This is a safety net for any code that still reads legacy columns directly.
 */
export function syncLegacyStockColumns(): void {
  db.exec(`
    UPDATE Material SET stockQuantity = COALESCE(
      (SELECT SUM(bs.stockQuantity) FROM BranchStock bs
       WHERE bs.itemType = 'material' AND bs.itemId = Material.id), 0
    )
  `);
  db.exec(`
    UPDATE Product SET stockQuantity = COALESCE(
      (SELECT SUM(bs.stockQuantity) FROM BranchStock bs
       WHERE bs.itemType = 'product' AND bs.itemId = Product.id), 0
    ) WHERE manageStock = 1
  `);
}
