import { db, initDatabase } from './init';
import { v4 as uuidv4 } from 'uuid';
import { getProductRecipe } from './recipeService';
import { getMaterial, updateMaterialStock } from './materialService';
import { getProduct, getProductByWcId } from './productService';

// Ensure database is initialized
initDatabase();

export interface InventoryConsumption {
  id: string;
  orderId: string;
  orderItemId?: string;
  productId: string;
  productName: string;
  productSku?: string;
  quantitySold: number;
  itemType: 'material' | 'product';
  materialId?: string;
  linkedProductId?: string;
  materialName?: string;
  linkedProductName?: string;
  quantityConsumed: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  consumedAt: string;
}

/**
 * Record inventory consumption when a product is sold
 * This automatically deducts materials from stock based on the product's recipe
 */
export function recordProductSale(
  orderId: string,
  wcProductId: string | number,
  productName: string,
  quantitySold: number,
  orderItemId?: string
): InventoryConsumption[] {
  const consumptions: InventoryConsumption[] = [];

  // Find product by WooCommerce ID
  const product = getProductByWcId(Number(wcProductId));

  if (!product) {
    console.warn(`⚠️  Product with WC ID ${wcProductId} not found in local database - no materials consumed`);
    return [];
  }

  const productId = product.id;

  // Get the product's recipe
  const recipe = getProductRecipe(productId);

  if (recipe.length === 0) {
    console.log(`⚠️  Product ${productName} has no recipe - no materials consumed`);
    return [];
  }

  const now = new Date().toISOString();

  // Process each recipe item
  recipe.forEach(recipeItem => {
    // Skip optional items (add-ons that weren't necessarily used)
    if (recipeItem.isOptional) {
      return;
    }

    // Calculate total consumed (recipe quantity × units sold)
    const quantityConsumed = recipeItem.quantity * quantitySold;

    // Record the consumption
    const consumptionId = uuidv4();
    const consumption: InventoryConsumption = {
      id: consumptionId,
      orderId,
      orderItemId,
      productId,
      productName,
      productSku: '',
      quantitySold,
      itemType: recipeItem.itemType,
      materialId: recipeItem.materialId,
      linkedProductId: recipeItem.linkedProductId,
      materialName: recipeItem.materialName,
      linkedProductName: recipeItem.linkedProductName,
      quantityConsumed,
      unit: recipeItem.unit,
      costPerUnit: recipeItem.costPerUnit || 0,
      totalCost: recipeItem.costPerUnit ? quantityConsumed * recipeItem.costPerUnit : 0,
      consumedAt: now,
    };

    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO InventoryConsumption
      (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
       materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
       unit, costPerUnit, totalCost, consumedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      consumptionId,
      orderId,
      orderItemId || null,
      productId,
      productName,
      quantitySold,
      recipeItem.itemType,
      recipeItem.materialId || null,
      recipeItem.linkedProductId || null,
      recipeItem.materialName || null,
      recipeItem.linkedProductName || null,
      quantityConsumed,
      recipeItem.unit,
      recipeItem.costPerUnit || 0,
      consumption.totalCost,
      now
    );

    consumptions.push(consumption);

    // Deduct from material stock (only for materials, not linked products)
    if (recipeItem.itemType === 'material' && recipeItem.materialId) {
      deductMaterialStock(recipeItem.materialId, quantityConsumed);
    }
  });

  console.log(`📦 Recorded ${consumptions.length} material consumptions for ${productName} x${quantitySold}`);

  return consumptions;
}

/**
 * Deduct material from stock
 */
function deductMaterialStock(materialId: string, quantity: number): void {
  const material = getMaterial(materialId);
  if (!material) {
    console.error(`❌ Material ${materialId} not found - cannot deduct stock`);
    return;
  }

  const newStock = material.stockQuantity - quantity;

  // Allow negative stock (backorder) but log warning
  if (newStock < 0) {
    console.warn(`⚠️  Material ${material.name} stock went negative: ${newStock} ${material.purchaseUnit}`);
  }

  // Log low stock warning
  if (newStock <= material.lowStockThreshold && newStock > material.lowStockThreshold - quantity) {
    console.warn(`🔔 Low stock alert: ${material.name} = ${newStock} ${material.purchaseUnit} (threshold: ${material.lowStockThreshold})`);
  }

  updateMaterialStock(materialId, newStock);
}

/**
 * Get consumption history for an order
 */
export function getOrderConsumptions(orderId: string): InventoryConsumption[] {
  const stmt = db.prepare(`
    SELECT * FROM InventoryConsumption
    WHERE orderId = ?
    ORDER BY consumedAt
  `);
  return stmt.all(orderId) as InventoryConsumption[];
}

/**
 * Get consumption history for a product
 */
export function getProductConsumptions(
  productId: string,
  startDate?: string,
  endDate?: string
): InventoryConsumption[] {
  let query = 'SELECT * FROM InventoryConsumption WHERE productId = ?';
  const params: any[] = [productId];

  if (startDate) {
    query += ' AND consumedAt >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND consumedAt <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY consumedAt DESC';

  const stmt = db.prepare(query);
  return stmt.all(...params) as InventoryConsumption[];
}

/**
 * Get consumption history for a material
 */
export function getMaterialConsumptions(
  materialId: string,
  startDate?: string,
  endDate?: string
): InventoryConsumption[] {
  let query = 'SELECT * FROM InventoryConsumption WHERE materialId = ?';
  const params: any[] = [materialId];

  if (startDate) {
    query += ' AND consumedAt >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND consumedAt <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY consumedAt DESC';

  const stmt = db.prepare(query);
  return stmt.all(...params) as InventoryConsumption[];
}

/**
 * Get total consumption for a date range
 */
export function getConsumptionSummary(
  startDate: string,
  endDate: string
): {
  totalOrders: number;
  totalProductsSold: number;
  totalCost: number;
  byMaterial: Array<{
    materialId: string;
    materialName: string;
    quantityConsumed: number;
    unit: string;
    totalCost: number;
  }>;
} {
  // Total orders and products
  const summaryStmt = db.prepare(`
    SELECT
      COUNT(DISTINCT orderId) as totalOrders,
      SUM(quantitySold) as totalProductsSold,
      SUM(totalCost) as totalCost
    FROM InventoryConsumption
    WHERE consumedAt >= ? AND consumedAt <= ?
  `);
  const summary = summaryStmt.get(startDate, endDate) as any;

  // Group by material
  const byMaterialStmt = db.prepare(`
    SELECT
      materialId,
      materialName,
      SUM(quantityConsumed) as quantityConsumed,
      unit,
      SUM(totalCost) as totalCost
    FROM InventoryConsumption
    WHERE consumedAt >= ? AND consumedAt <= ? AND materialId IS NOT NULL
    GROUP BY materialId, materialName, unit
    ORDER BY totalCost DESC
  `);
  const byMaterial = byMaterialStmt.all(startDate, endDate) as any[];

  return {
    totalOrders: summary.totalOrders || 0,
    totalProductsSold: summary.totalProductsSold || 0,
    totalCost: summary.totalCost || 0,
    byMaterial: byMaterial.map(m => ({
      materialId: m.materialId,
      materialName: m.materialName,
      quantityConsumed: m.quantityConsumed,
      unit: m.unit,
      totalCost: m.totalCost,
    })),
  };
}

/**
 * Calculate COGS for a product sale
 */
export function calculateProductCOGS(wcProductId: string | number, quantity: number): {
  totalCOGS: number;
  breakdown: Array<{
    itemType: 'material' | 'product';
    itemId: string;
    itemName: string;
    quantityUsed: number;
    unit: string;
    costPerUnit: number;
    totalCost: number;
  }>;
} {
  // Find product by WooCommerce ID
  const product = getProductByWcId(Number(wcProductId));

  if (!product) {
    console.warn(`⚠️  Product with WC ID ${wcProductId} not found - COGS calculation skipped`);
    return { totalCOGS: 0, breakdown: [] };
  }

  const recipe = getProductRecipe(product.id);

  const breakdown = recipe
    .filter(item => !item.isOptional)
    .map(item => ({
      itemType: item.itemType,
      itemId: (item.itemType === 'material' ? item.materialId : item.linkedProductId) || '',
      itemName: (item.itemType === 'material' ? item.materialName : item.linkedProductName) || '',
      quantityUsed: item.quantity * quantity,
      unit: item.unit,
      costPerUnit: item.costPerUnit || 0,
      totalCost: item.calculatedCost * quantity,
    }));

  const totalCOGS = breakdown.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalCOGS,
    breakdown,
  };
}
