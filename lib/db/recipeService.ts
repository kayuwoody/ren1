/**
 * Recipe Service
 * Manages product recipes (ingredient/material lists with quantities)
 */

import db from './init';
import { v4 as uuidv4 } from 'uuid';
import { getMaterial } from './materialService';
import { getProduct, updateProductCost } from './productService';

// ============================================================================
// Types
// ============================================================================

export interface ProductRecipeItem {
  id: string;
  productId: string;
  materialId: string;
  materialName?: string; // Populated from join
  materialCategory?: string;
  purchaseUnit?: string;
  costPerUnit?: number;
  quantity: number;
  unit: string;
  calculatedCost: number;
  isOptional: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeWithMaterials {
  productId: string;
  productName: string;
  items: ProductRecipeItem[];
  totalCost: number;
  totalOptionalCost: number;
}

// ============================================================================
// Recipe CRUD Operations
// ============================================================================

/**
 * Add an ingredient/material to a product recipe
 */
export function addRecipeItem(item: {
  productId: string;
  materialId: string;
  quantity: number;
  unit: string;
  isOptional?: boolean;
  sortOrder?: number;
}): ProductRecipeItem {
  const id = uuidv4();
  const now = new Date().toISOString();

  // Get material to calculate cost
  const material = getMaterial(item.materialId);
  if (!material) {
    throw new Error(`Material not found: ${item.materialId}`);
  }

  // Calculate cost based on quantity
  // Convert units if necessary (assume same unit for now)
  const calculatedCost = item.quantity * material.costPerUnit;

  const stmt = db.prepare(`
    INSERT INTO ProductRecipe (
      id, productId, materialId, quantity, unit, calculatedCost,
      isOptional, sortOrder, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    item.productId,
    item.materialId,
    item.quantity,
    item.unit,
    calculatedCost,
    item.isOptional ? 1 : 0,
    item.sortOrder || 0,
    now,
    now
  );

  // Update product's total cost
  updateProductTotalCost(item.productId);

  return getRecipeItem(id)!;
}

/**
 * Update a recipe item
 */
export function updateRecipeItem(
  id: string,
  updates: {
    quantity?: number;
    unit?: string;
    isOptional?: boolean;
    sortOrder?: number;
  }
): ProductRecipeItem {
  const existing = getRecipeItem(id);
  if (!existing) {
    throw new Error(`Recipe item not found: ${id}`);
  }

  const quantity = updates.quantity ?? existing.quantity;
  const unit = updates.unit ?? existing.unit;

  // Recalculate cost if quantity changed
  const material = getMaterial(existing.materialId);
  if (!material) {
    throw new Error(`Material not found: ${existing.materialId}`);
  }

  const calculatedCost = quantity * material.costPerUnit;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE ProductRecipe
    SET quantity = ?,
        unit = ?,
        calculatedCost = ?,
        isOptional = ?,
        sortOrder = ?,
        updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(
    quantity,
    unit,
    calculatedCost,
    updates.isOptional !== undefined ? (updates.isOptional ? 1 : 0) : existing.isOptional,
    updates.sortOrder ?? existing.sortOrder,
    now,
    id
  );

  // Update product's total cost
  updateProductTotalCost(existing.productId);

  return getRecipeItem(id)!;
}

/**
 * Delete a recipe item
 */
export function deleteRecipeItem(id: string): void {
  const item = getRecipeItem(id);
  if (!item) return;

  const stmt = db.prepare('DELETE FROM ProductRecipe WHERE id = ?');
  stmt.run(id);

  // Update product's total cost
  updateProductTotalCost(item.productId);
}

/**
 * Get a single recipe item
 */
export function getRecipeItem(id: string): ProductRecipeItem | null {
  const stmt = db.prepare(`
    SELECT pr.*, m.name as materialName, m.category as materialCategory,
           m.purchaseUnit, m.costPerUnit
    FROM ProductRecipe pr
    LEFT JOIN Material m ON pr.materialId = m.id
    WHERE pr.id = ?
  `);

  const row = stmt.get(id) as any;
  if (!row) return null;

  return {
    ...row,
    isOptional: row.isOptional === 1,
  } as ProductRecipeItem;
}

/**
 * Get all recipe items for a product
 */
export function getProductRecipe(productId: string): ProductRecipeItem[] {
  const stmt = db.prepare(`
    SELECT pr.*, m.name as materialName, m.category as materialCategory,
           m.purchaseUnit, m.costPerUnit
    FROM ProductRecipe pr
    LEFT JOIN Material m ON pr.materialId = m.id
    WHERE pr.productId = ?
    ORDER BY pr.sortOrder, pr.createdAt
  `);

  const rows = stmt.all(productId) as any[];

  return rows.map(row => ({
    ...row,
    isOptional: row.isOptional === 1,
  })) as ProductRecipeItem[];
}

/**
 * Get product recipe with full details
 */
export function getRecipeWithMaterials(productId: string): RecipeWithMaterials | null {
  const product = getProduct(productId);
  if (!product) return null;

  const items = getProductRecipe(productId);

  const totalCost = items
    .filter(item => !item.isOptional)
    .reduce((sum, item) => sum + item.calculatedCost, 0);

  const totalOptionalCost = items
    .filter(item => item.isOptional)
    .reduce((sum, item) => sum + item.calculatedCost, 0);

  return {
    productId,
    productName: product.name,
    items,
    totalCost,
    totalOptionalCost,
  };
}

/**
 * Clear all recipe items for a product
 */
export function clearProductRecipe(productId: string): void {
  const stmt = db.prepare('DELETE FROM ProductRecipe WHERE productId = ?');
  stmt.run(productId);

  // Update product cost to 0
  updateProductCost(productId, 0);
}

/**
 * Bulk update recipe (replace all items)
 */
export function setProductRecipe(
  productId: string,
  items: Array<{
    materialId: string;
    quantity: number;
    unit: string;
    isOptional?: boolean;
    sortOrder?: number;
  }>
): RecipeWithMaterials {
  // Start transaction
  const setRecipe = db.transaction(() => {
    // Clear existing recipe
    clearProductRecipe(productId);

    // Add new items
    items.forEach((item, index) => {
      addRecipeItem({
        productId,
        materialId: item.materialId,
        quantity: item.quantity,
        unit: item.unit,
        isOptional: item.isOptional || false,
        sortOrder: item.sortOrder !== undefined ? item.sortOrder : index,
      });
    });
  });

  setRecipe();

  return getRecipeWithMaterials(productId)!;
}

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Recalculate and update product's total cost from recipe
 * Called automatically when recipe changes
 */
export function updateProductTotalCost(productId: string): void {
  const recipe = getProductRecipe(productId);

  // Sum all non-optional item costs
  const totalCost = recipe
    .filter(item => !item.isOptional)
    .reduce((sum, item) => sum + item.calculatedCost, 0);

  // Update product unit cost
  updateProductCost(productId, totalCost);
}

/**
 * Recalculate all recipe costs when a material price changes
 * Call this after updating material prices
 */
export function recalculateRecipeCostsForMaterial(materialId: string): void {
  const material = getMaterial(materialId);
  if (!material) return;

  const stmt = db.prepare(`
    SELECT id, productId, quantity FROM ProductRecipe
    WHERE materialId = ?
  `);

  const items = stmt.all(materialId) as any[];

  items.forEach(item => {
    const newCost = item.quantity * material.costPerUnit;

    const updateStmt = db.prepare(`
      UPDATE ProductRecipe
      SET calculatedCost = ?, updatedAt = datetime('now')
      WHERE id = ?
    `);

    updateStmt.run(newCost, item.id);

    // Update product total cost
    updateProductTotalCost(item.productId);
  });

  console.log(`✅ Recalculated ${items.length} recipe items using ${material.name}`);
}

/**
 * Get all products using a specific material
 */
export function getProductsUsingMaterial(materialId: string): Array<{
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  calculatedCost: number;
}> {
  const stmt = db.prepare(`
    SELECT pr.productId, p.name as productName, pr.quantity, pr.unit, pr.calculatedCost
    FROM ProductRecipe pr
    LEFT JOIN Product p ON pr.productId = p.id
    WHERE pr.materialId = ?
    ORDER BY p.name
  `);

  return stmt.all(materialId) as any[];
}
