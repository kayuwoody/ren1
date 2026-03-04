/**
 * Stock Movement Service
 *
 * Unified audit trail for all stock level changes.
 * Logs movements from: sales, PO receiving, stock checks, manual adjustments.
 */

import { db, initDatabase } from './init';
import { v4 as uuidv4 } from 'uuid';

// Ensure database is initialized
initDatabase();

export type MovementType = 'sale' | 'po_received' | 'stock_check' | 'manual_adjustment';
export type ItemType = 'product' | 'material';

export interface StockMovement {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemName: string;
  movementType: MovementType;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  referenceId?: string;
  referenceNote?: string;
  notes?: string;
  createdAt: string;
}

export interface LogStockMovementInput {
  itemType: ItemType;
  itemId: string;
  itemName: string;
  movementType: MovementType;
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  referenceId?: string;
  referenceNote?: string;
  notes?: string;
}

/**
 * Log a stock movement entry
 */
export function logStockMovement(input: LogStockMovementInput): StockMovement {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO StockMovement (id, itemType, itemId, itemName, movementType, quantityChange, stockBefore, stockAfter, referenceId, referenceNote, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.itemType,
    input.itemId,
    input.itemName,
    input.movementType,
    input.quantityChange,
    input.stockBefore,
    input.stockAfter,
    input.referenceId || null,
    input.referenceNote || null,
    input.notes || null,
    now
  );

  return {
    id,
    ...input,
    createdAt: now,
  };
}

/**
 * Get stock movements for a specific item
 */
export function getItemStockMovements(
  itemType: ItemType,
  itemId: string,
  startDate?: string,
  endDate?: string
): StockMovement[] {
  let query = 'SELECT * FROM StockMovement WHERE itemType = ? AND itemId = ?';
  const params: any[] = [itemType, itemId];

  if (startDate) {
    query += ' AND createdAt >= ?';
    params.push(startDate);
  }
  if (endDate) {
    query += ' AND createdAt <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY createdAt DESC';

  return db.prepare(query).all(...params) as StockMovement[];
}

/**
 * Get all stock movements with optional filters
 */
export function getAllStockMovements(options?: {
  startDate?: string;
  endDate?: string;
  movementType?: MovementType;
  itemType?: ItemType;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}): { movements: StockMovement[]; total: number } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (options?.startDate) {
    conditions.push('createdAt >= ?');
    params.push(options.startDate);
  }
  if (options?.endDate) {
    conditions.push('createdAt <= ?');
    params.push(options.endDate);
  }
  if (options?.movementType) {
    conditions.push('movementType = ?');
    params.push(options.movementType);
  }
  if (options?.itemType) {
    conditions.push('itemType = ?');
    params.push(options.itemType);
  }
  if (options?.searchQuery) {
    conditions.push('itemName LIKE ?');
    params.push(`%${options.searchQuery}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countResult = db.prepare(`SELECT COUNT(*) as count FROM StockMovement ${whereClause}`).get(...params) as { count: number };

  // Get paginated results
  let query = `SELECT * FROM StockMovement ${whereClause} ORDER BY createdAt DESC`;

  const limit = options?.limit || 100;
  const offset = options?.offset || 0;
  query += ' LIMIT ? OFFSET ?';

  const movements = db.prepare(query).all(...params, limit, offset) as StockMovement[];

  return { movements, total: countResult.count };
}

/**
 * Get all unique items that have stock movements (for item picker)
 */
export function getItemsWithMovements(): Array<{ itemType: ItemType; itemId: string; itemName: string; movementCount: number }> {
  const results = db.prepare(`
    SELECT itemType, itemId, itemName, COUNT(*) as movementCount
    FROM StockMovement
    GROUP BY itemType, itemId
    ORDER BY itemName ASC
  `).all() as Array<{ itemType: ItemType; itemId: string; itemName: string; movementCount: number }>;

  return results;
}

/**
 * Get movement summary stats for a date range
 */
export function getMovementSummary(startDate?: string, endDate?: string): {
  totalMovements: number;
  salesDeductions: number;
  poAdditions: number;
  stockCheckAdjustments: number;
  manualAdjustments: number;
  itemsAffected: number;
} {
  const conditions: string[] = [];
  const params: any[] = [];

  if (startDate) {
    conditions.push('createdAt >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('createdAt <= ?');
    params.push(endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = db.prepare(`SELECT COUNT(*) as count FROM StockMovement ${whereClause}`).get(...params) as { count: number };

  const byType = db.prepare(`
    SELECT movementType, COUNT(*) as count
    FROM StockMovement ${whereClause}
    GROUP BY movementType
  `).all(...params) as Array<{ movementType: string; count: number }>;

  const itemsResult = db.prepare(`
    SELECT COUNT(DISTINCT itemId || '-' || itemType) as count
    FROM StockMovement ${whereClause}
  `).get(...params) as { count: number };

  const typeMap: Record<string, number> = {};
  byType.forEach(t => { typeMap[t.movementType] = t.count; });

  return {
    totalMovements: totalResult.count,
    salesDeductions: typeMap['sale'] || 0,
    poAdditions: typeMap['po_received'] || 0,
    stockCheckAdjustments: typeMap['stock_check'] || 0,
    manualAdjustments: typeMap['manual_adjustment'] || 0,
    itemsAffected: itemsResult.count,
  };
}
