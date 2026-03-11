/**
 * Stock Check Log Service
 *
 * Manages audit trail for stock check operations
 */

import { db } from './init';
import { v4 as uuidv4 } from 'uuid';

export interface StockCheckLog {
  id: string;
  checkDate: string;
  itemsChecked: number;
  itemsAdjusted: number;
  notes?: string;
  createdAt: string;
}

export interface StockCheckLogItem {
  id: string;
  stockCheckLogId: string;
  itemType: 'product' | 'material';
  itemId: string;
  itemName: string;
  supplier?: string;
  previousStock: number;
  countedStock: number;
  difference: number;
  unit: string;
  note?: string;
  wcSynced: boolean;
  createdAt: string;
}

export interface StockCheckLogWithItems extends StockCheckLog {
  items: StockCheckLogItem[];
}

export interface CreateStockCheckLogInput {
  notes?: string;
  items: {
    itemType: 'product' | 'material';
    itemId: string;
    itemName: string;
    supplier?: string;
    previousStock: number;
    countedStock: number;
    unit: string;
    note?: string;
    wcSynced?: boolean;
  }[];
}

/**
 * Create a new stock check log with items
 */
export function createStockCheckLog(input: CreateStockCheckLogInput): StockCheckLog {
  const logId = uuidv4();
  const now = new Date().toISOString();

  // Count items with actual adjustments (difference != 0)
  const itemsAdjusted = input.items.filter(
    item => item.countedStock !== item.previousStock
  ).length;

  // Insert the main log entry
  const insertLog = db.prepare(`
    INSERT INTO StockCheckLog (id, checkDate, itemsChecked, itemsAdjusted, notes, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertLog.run(logId, now, input.items.length, itemsAdjusted, input.notes || null, now);

  // Insert all log items
  const insertItem = db.prepare(`
    INSERT INTO StockCheckLogItem (id, stockCheckLogId, itemType, itemId, itemName, supplier, previousStock, countedStock, difference, unit, note, wcSynced, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of input.items) {
    const difference = item.countedStock - item.previousStock;
    insertItem.run(
      uuidv4(),
      logId,
      item.itemType,
      item.itemId,
      item.itemName,
      item.supplier || null,
      item.previousStock,
      item.countedStock,
      difference,
      item.unit,
      item.note || null,
      item.wcSynced ? 1 : 0,
      now
    );
  }

  return {
    id: logId,
    checkDate: now,
    itemsChecked: input.items.length,
    itemsAdjusted,
    notes: input.notes,
    createdAt: now,
  };
}

/**
 * Get all stock check logs (summary only)
 */
export function getAllStockCheckLogs(): StockCheckLog[] {
  const stmt = db.prepare(`
    SELECT id, checkDate, itemsChecked, itemsAdjusted, notes, createdAt
    FROM StockCheckLog
    ORDER BY checkDate DESC
  `);

  return stmt.all() as StockCheckLog[];
}

/**
 * Get stock check logs with pagination
 */
export function getStockCheckLogs(limit: number = 20, offset: number = 0): {
  logs: StockCheckLog[];
  total: number;
} {
  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM StockCheckLog`);
  const { count } = countStmt.get() as { count: number };

  const stmt = db.prepare(`
    SELECT id, checkDate, itemsChecked, itemsAdjusted, notes, createdAt
    FROM StockCheckLog
    ORDER BY checkDate DESC
    LIMIT ? OFFSET ?
  `);

  const logs = stmt.all(limit, offset) as StockCheckLog[];

  return { logs, total: count };
}

/**
 * Get a single stock check log with all its items
 */
export function getStockCheckLogWithItems(logId: string): StockCheckLogWithItems | null {
  const logStmt = db.prepare(`
    SELECT id, checkDate, itemsChecked, itemsAdjusted, notes, createdAt
    FROM StockCheckLog
    WHERE id = ?
  `);

  const log = logStmt.get(logId) as StockCheckLog | undefined;
  if (!log) return null;

  const itemsStmt = db.prepare(`
    SELECT id, stockCheckLogId, itemType, itemId, itemName, supplier, previousStock, countedStock, difference, unit, note, wcSynced, createdAt
    FROM StockCheckLogItem
    WHERE stockCheckLogId = ?
    ORDER BY supplier, itemName
  `);

  const items = itemsStmt.all(logId) as any[];

  return {
    ...log,
    items: items.map(item => ({
      ...item,
      wcSynced: item.wcSynced === 1,
    })),
  };
}

/**
 * Get stock adjustment history for a specific item
 */
export function getItemStockHistory(itemId: string, itemType: 'product' | 'material'): StockCheckLogItem[] {
  const stmt = db.prepare(`
    SELECT id, stockCheckLogId, itemType, itemId, itemName, supplier, previousStock, countedStock, difference, unit, note, wcSynced, createdAt
    FROM StockCheckLogItem
    WHERE itemId = ? AND itemType = ?
    ORDER BY createdAt DESC
  `);

  const items = stmt.all(itemId, itemType) as any[];

  return items.map(item => ({
    ...item,
    wcSynced: item.wcSynced === 1,
  }));
}

/**
 * Delete a stock check log and its items
 */
export function deleteStockCheckLog(logId: string): boolean {
  const stmt = db.prepare(`DELETE FROM StockCheckLog WHERE id = ?`);
  const result = stmt.run(logId);
  return result.changes > 0;
}
