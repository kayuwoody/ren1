/**
 * Branch Stock Service
 *
 * Per-branch stock tracking operations
 */

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

export function getBranchStockRecord(branchId: string, itemType: string, itemId: string): BranchStock | null {
  const row = db.prepare(
    'SELECT * FROM BranchStock WHERE branchId = ? AND itemType = ? AND itemId = ?'
  ).get(branchId, itemType, itemId) as BranchStock | undefined;
  return row ?? null;
}

export function updateBranchStock(branchId: string, itemType: string, itemId: string, quantity: number): void {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT id FROM BranchStock WHERE branchId = ? AND itemType = ? AND itemId = ?'
  ).get(branchId, itemType, itemId);

  if (existing) {
    db.prepare(
      'UPDATE BranchStock SET stockQuantity = ?, updatedAt = ? WHERE branchId = ? AND itemType = ? AND itemId = ?'
    ).run(quantity, now, branchId, itemType, itemId);
  } else {
    db.prepare(
      'INSERT INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).run(uuidv4(), branchId, itemType, itemId, quantity, now);
  }
}

export function adjustBranchStock(branchId: string, itemType: string, itemId: string, delta: number): number {
  const current = getBranchStock(branchId, itemType, itemId);
  const newQuantity = current + delta;
  updateBranchStock(branchId, itemType, itemId, newQuantity);
  return newQuantity;
}

export function getBranchStockForBranch(branchId: string): BranchStock[] {
  return db.prepare(
    'SELECT * FROM BranchStock WHERE branchId = ? ORDER BY itemType, itemId'
  ).all(branchId) as BranchStock[];
}

export function getLowStockItems(branchId: string): (BranchStock & { itemName?: string })[] {
  const rows = db.prepare(`
    SELECT bs.*,
      CASE bs.itemType
        WHEN 'material' THEN (SELECT name FROM Material WHERE id = bs.itemId)
        WHEN 'product' THEN (SELECT name FROM Product WHERE id = bs.itemId)
      END as itemName
    FROM BranchStock bs
    WHERE bs.branchId = ? AND bs.stockQuantity <= bs.lowStockThreshold AND bs.lowStockThreshold > 0
    ORDER BY bs.itemType, bs.stockQuantity
  `).all(branchId) as (BranchStock & { itemName?: string })[];
  return rows;
}

export function updateLowStockThreshold(branchId: string, itemType: string, itemId: string, threshold: number): void {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT id FROM BranchStock WHERE branchId = ? AND itemType = ? AND itemId = ?'
  ).get(branchId, itemType, itemId);

  if (existing) {
    db.prepare(
      'UPDATE BranchStock SET lowStockThreshold = ?, updatedAt = ? WHERE branchId = ? AND itemType = ? AND itemId = ?'
    ).run(threshold, now, branchId, itemType, itemId);
  } else {
    db.prepare(
      'INSERT INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)'
    ).run(uuidv4(), branchId, itemType, itemId, threshold, now);
  }
}

export function initBranchStockForNewBranch(branchId: string): void {
  const now = new Date().toISOString();

  // Create zero-stock entries for all materials
  const materials = db.prepare('SELECT id, lowStockThreshold FROM Material').all() as any[];
  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold, updatedAt) VALUES (?, ?, ?, ?, 0, ?, ?)'
  );

  for (const mat of materials) {
    insertStmt.run(uuidv4(), branchId, 'material', mat.id, mat.lowStockThreshold || 0, now);
  }

  // Create zero-stock entries for all products with stock management
  const products = db.prepare('SELECT id FROM Product WHERE manageStock = 1').all() as any[];
  for (const prod of products) {
    insertStmt.run(uuidv4(), branchId, 'product', prod.id, 0, now);
  }
}
