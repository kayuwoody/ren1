/**
 * Product Database Service
 * Handles all product-related database operations including COGS tracking
 */

import db from './init';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface Product {
  id: string;
  woocommerceId?: number;
  name: string;
  category: string;
  sku: string;
  basePrice: number;
  currentPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  unit: string;
  unitCost: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  type: 'purchase' | 'sale' | 'waste' | 'adjustment';
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number;
  totalCost?: number;
  orderId?: string;
  purchaseOrderId?: string;
  reason?: string;
  performedBy: string;
  timestamp: string;
}

export interface ProductCostBreakdown {
  id: string;
  productId: string;
  ingredientCosts: Array<{
    ingredientId: string;
    name: string;
    cost: number;
  }>;
  totalIngredientCost: number;
  packagingCosts: Array<{
    materialId: string;
    name: string;
    quantity: number;
    cost: number;
  }>;
  totalPackagingCost: number;
  consumables: Array<{
    materialId: string;
    name: string;
    cost: number;
  }>;
  totalConsumableCost: number;
  totalCost: number;
  sellingPrice: number;
  grossProfit: number;
  grossMargin: number;
  calculatedAt: string;
}

// ============================================================================
// Product CRUD Operations
// ============================================================================

/**
 * Create or update a product
 */
export function upsertProduct(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Product {
  const id = product.id || uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO Product (
      id, woocommerceId, name, category, sku,
      basePrice, currentPrice, stockQuantity, lowStockThreshold, unit,
      unitCost, isActive, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      currentPrice = excluded.currentPrice,
      stockQuantity = excluded.stockQuantity,
      unitCost = excluded.unitCost,
      isActive = excluded.isActive,
      updatedAt = excluded.updatedAt
  `);

  stmt.run(
    id,
    product.woocommerceId || null,
    product.name,
    product.category,
    product.sku,
    product.basePrice,
    product.currentPrice,
    product.stockQuantity,
    product.lowStockThreshold,
    product.unit,
    product.unitCost,
    product.isActive ? 1 : 0,
    now,
    now
  );

  return getProduct(id)!;
}

/**
 * Get product by ID
 */
export function getProduct(id: string): Product | null {
  const stmt = db.prepare('SELECT * FROM Product WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) return null;

  return {
    ...row,
    isActive: row.isActive === 1,
  };
}

/**
 * Get product by WooCommerce ID
 */
export function getProductByWooId(woocommerceId: number): Product | null {
  const stmt = db.prepare('SELECT * FROM Product WHERE woocommerceId = ?');
  const row = stmt.get(woocommerceId) as any;

  if (!row) return null;

  return {
    ...row,
    isActive: row.isActive === 1,
  };
}

/**
 * Get product by SKU
 */
export function getProductBySku(sku: string): Product | null {
  const stmt = db.prepare('SELECT * FROM Product WHERE sku = ?');
  const row = stmt.get(sku) as any;

  if (!row) return null;

  return {
    ...row,
    isActive: row.isActive === 1,
  };
}

/**
 * List all active products
 */
export function listActiveProducts(): Product[] {
  const stmt = db.prepare('SELECT * FROM Product WHERE isActive = 1 ORDER BY name');
  const rows = stmt.all() as any[];

  return rows.map(row => ({
    ...row,
    isActive: true,
  }));
}

/**
 * List products by category
 */
export function listProductsByCategory(category: string): Product[] {
  const stmt = db.prepare('SELECT * FROM Product WHERE category = ? AND isActive = 1 ORDER BY name');
  const rows = stmt.all(category) as any[];

  return rows.map(row => ({
    ...row,
    isActive: true,
  }));
}

/**
 * Update product stock quantity
 */
export function updateProductStock(productId: string, newQuantity: number): void {
  const stmt = db.prepare(`
    UPDATE Product
    SET stockQuantity = ?, updatedAt = datetime('now')
    WHERE id = ?
  `);

  stmt.run(newQuantity, productId);
}

/**
 * Update product unit cost
 */
export function updateProductCost(productId: string, newCost: number): void {
  const stmt = db.prepare(`
    UPDATE Product
    SET unitCost = ?, updatedAt = datetime('now')
    WHERE id = ?
  `);

  stmt.run(newCost, productId);
}

// ============================================================================
// Stock Movement Operations
// ============================================================================

/**
 * Record a stock movement
 */
export function recordStockMovement(movement: Omit<StockMovement, 'id' | 'timestamp'>): StockMovement {
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO StockMovement (
      id, productId, type, quantity, previousStock, newStock,
      unitCost, totalCost, orderId, purchaseOrderId, reason, performedBy, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    movement.productId,
    movement.type,
    movement.quantity,
    movement.previousStock,
    movement.newStock,
    movement.unitCost || null,
    movement.totalCost || null,
    movement.orderId || null,
    movement.purchaseOrderId || null,
    movement.reason || null,
    movement.performedBy,
    timestamp
  );

  // Update product stock quantity
  updateProductStock(movement.productId, movement.newStock);

  return {
    id,
    ...movement,
    timestamp,
  };
}

/**
 * Get stock movements for a product
 */
export function getStockMovements(productId: string, limit: number = 50): StockMovement[] {
  const stmt = db.prepare(`
    SELECT * FROM StockMovement
    WHERE productId = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `);

  return stmt.all(productId, limit) as StockMovement[];
}

/**
 * Get low stock products
 */
export function getLowStockProducts(): Product[] {
  const stmt = db.prepare(`
    SELECT * FROM Product
    WHERE stockQuantity <= lowStockThreshold AND isActive = 1
    ORDER BY stockQuantity ASC
  `);

  const rows = stmt.all() as any[];

  return rows.map(row => ({
    ...row,
    isActive: true,
  }));
}

// ============================================================================
// Cost Breakdown Operations
// ============================================================================

/**
 * Save product cost breakdown
 */
export function saveProductCostBreakdown(
  breakdown: Omit<ProductCostBreakdown, 'id' | 'calculatedAt'>
): ProductCostBreakdown {
  const id = uuidv4();
  const calculatedAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO ProductCostBreakdown (
      id, productId, ingredientCosts, totalIngredientCost,
      packagingCosts, totalPackagingCost, consumables, totalConsumableCost,
      totalCost, sellingPrice, grossProfit, grossMargin, calculatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    breakdown.productId,
    JSON.stringify(breakdown.ingredientCosts),
    breakdown.totalIngredientCost,
    JSON.stringify(breakdown.packagingCosts),
    breakdown.totalPackagingCost,
    JSON.stringify(breakdown.consumables),
    breakdown.totalConsumableCost,
    breakdown.totalCost,
    breakdown.sellingPrice,
    breakdown.grossProfit,
    breakdown.grossMargin,
    calculatedAt
  );

  // Update product's unit cost
  updateProductCost(breakdown.productId, breakdown.totalCost);

  return {
    id,
    ...breakdown,
    calculatedAt,
  };
}

/**
 * Get latest cost breakdown for a product
 */
export function getLatestCostBreakdown(productId: string): ProductCostBreakdown | null {
  const stmt = db.prepare(`
    SELECT * FROM ProductCostBreakdown
    WHERE productId = ?
    ORDER BY calculatedAt DESC
    LIMIT 1
  `);

  const row = stmt.get(productId) as any;

  if (!row) return null;

  return {
    ...row,
    ingredientCosts: JSON.parse(row.ingredientCosts),
    packagingCosts: JSON.parse(row.packagingCosts),
    consumables: JSON.parse(row.consumables),
  };
}

/**
 * Get cost history for a product
 */
export function getCostHistory(productId: string, limit: number = 10): ProductCostBreakdown[] {
  const stmt = db.prepare(`
    SELECT * FROM ProductCostBreakdown
    WHERE productId = ?
    ORDER BY calculatedAt DESC
    LIMIT ?
  `);

  const rows = stmt.all(productId, limit) as any[];

  return rows.map(row => ({
    ...row,
    ingredientCosts: JSON.parse(row.ingredientCosts),
    packagingCosts: JSON.parse(row.packagingCosts),
    consumables: JSON.parse(row.consumables),
  }));
}
