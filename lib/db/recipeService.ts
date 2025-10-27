import { db, initDatabase } from './init';
import { getMaterial } from './materialService';
import { v4 as uuidv4 } from 'uuid';

// Ensure database is initialized
initDatabase();

export interface ProductRecipeItem {
  id: string;
  productId: string;
  materialId: string;
  materialName?: string; // populated in queries
  quantity: number;
  unit: string;
  calculatedCost: number;
  isOptional: boolean;
  sortOrder: number;
  createdAt: string;
}

/**
 * Add a recipe item to a product
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
    throw new Error(`Material ${item.materialId} not found`);
  }

  const calculatedCost = item.quantity * material.costPerUnit;

  const stmt = db.prepare(`
    INSERT INTO ProductRecipe
    (id, productId, materialId, quantity, unit, calculatedCost, isOptional, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    item.productId,
    item.materialId,
    item.quantity,
    item.unit,
    calculatedCost,
    item.isOptional ? 1 : 0,
    item.sortOrder ?? 0,
    now
  );

  // Update product total cost
  updateProductTotalCost(item.productId);

  return getRecipeItem(id)!;
}

/**
 * Get a single recipe item
 */
export function getRecipeItem(id: string): ProductRecipeItem | undefined {
  const stmt = db.prepare(`
    SELECT pr.*, m.name as materialName
    FROM ProductRecipe pr
    JOIN Material m ON pr.materialId = m.id
    WHERE pr.id = ?
  `);
  const row = stmt.get(id) as any;
  if (!row) return undefined;

  return {
    id: row.id,
    productId: row.productId,
    materialId: row.materialId,
    materialName: row.materialName,
    quantity: row.quantity,
    unit: row.unit,
    calculatedCost: row.calculatedCost,
    isOptional: row.isOptional === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

/**
 * Get all recipe items for a product
 */
export function getProductRecipe(productId: string): ProductRecipeItem[] {
  const stmt = db.prepare(`
    SELECT pr.*, m.name as materialName
    FROM ProductRecipe pr
    JOIN Material m ON pr.materialId = m.id
    WHERE pr.productId = ?
    ORDER BY pr.sortOrder, pr.createdAt
  `);

  const rows = stmt.all(productId) as any[];
  return rows.map(row => ({
    id: row.id,
    productId: row.productId,
    materialId: row.materialId,
    materialName: row.materialName,
    quantity: row.quantity,
    unit: row.unit,
    calculatedCost: row.calculatedCost,
    isOptional: row.isOptional === 1,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  }));
}

/**
 * Update a recipe item
 */
export function updateRecipeItem(
  id: string,
  updates: {
    quantity?: number;
    isOptional?: boolean;
    sortOrder?: number;
  }
): ProductRecipeItem {
  const existing = getRecipeItem(id);
  if (!existing) {
    throw new Error(`Recipe item ${id} not found`);
  }

  const quantity = updates.quantity ?? existing.quantity;
  const material = getMaterial(existing.materialId);
  if (!material) {
    throw new Error(`Material ${existing.materialId} not found`);
  }

  const calculatedCost = quantity * material.costPerUnit;

  const stmt = db.prepare(`
    UPDATE ProductRecipe
    SET quantity = ?, calculatedCost = ?, isOptional = ?, sortOrder = ?
    WHERE id = ?
  `);

  stmt.run(
    quantity,
    calculatedCost,
    updates.isOptional !== undefined ? (updates.isOptional ? 1 : 0) : existing.isOptional,
    updates.sortOrder ?? existing.sortOrder,
    id
  );

  // Update product total cost
  updateProductTotalCost(existing.productId);

  return getRecipeItem(id)!;
}

/**
 * Delete a recipe item
 */
export function deleteRecipeItem(id: string): boolean {
  const item = getRecipeItem(id);
  if (!item) return false;

  const stmt = db.prepare('DELETE FROM ProductRecipe WHERE id = ?');
  const result = stmt.run(id);

  if (result.changes > 0) {
    // Update product total cost
    updateProductTotalCost(item.productId);
  }

  return result.changes > 0;
}

/**
 * Delete all recipe items for a product
 */
export function deleteProductRecipe(productId: string): boolean {
  const stmt = db.prepare('DELETE FROM ProductRecipe WHERE productId = ?');
  const result = stmt.run(productId);

  if (result.changes > 0) {
    // Update product total cost to 0
    updateProductTotalCost(productId);
  }

  return result.changes > 0;
}

/**
 * Set a complete recipe for a product (replaces existing)
 */
export function setProductRecipe(
  productId: string,
  items: Array<{
    materialId: string;
    quantity: number;
    unit: string;
    isOptional?: boolean;
  }>
): ProductRecipeItem[] {
  // Delete existing recipe
  deleteProductRecipe(productId);

  // Add new items
  const recipeItems: ProductRecipeItem[] = [];
  items.forEach((item, index) => {
    const recipeItem = addRecipeItem({
      productId,
      materialId: item.materialId,
      quantity: item.quantity,
      unit: item.unit,
      isOptional: item.isOptional,
      sortOrder: index,
    });
    recipeItems.push(recipeItem);
  });

  return recipeItems;
}

/**
 * Recalculate all recipe costs for a material (when price changes)
 */
export function recalculateRecipeCostsForMaterial(materialId: string): void {
  const material = getMaterial(materialId);
  if (!material) {
    throw new Error(`Material ${materialId} not found`);
  }

  // Get all recipe items using this material
  const stmt = db.prepare('SELECT * FROM ProductRecipe WHERE materialId = ?');
  const items = stmt.all(materialId) as ProductRecipeItem[];

  // Update each recipe item's calculated cost
  const updateStmt = db.prepare('UPDATE ProductRecipe SET calculatedCost = ? WHERE id = ?');

  const productIds = new Set<string>();
  items.forEach(item => {
    const newCost = item.quantity * material.costPerUnit;
    updateStmt.run(newCost, item.id);
    productIds.add(item.productId);
  });

  // Update all affected products' total costs
  productIds.forEach(productId => {
    updateProductTotalCost(productId);
  });

  console.log(`♻️  Recalculated costs for ${items.length} recipe items across ${productIds.size} products`);
}

/**
 * Update product's total cost based on recipe
 */
export function updateProductTotalCost(productId: string): void {
  const recipe = getProductRecipe(productId);

  // Sum only required items (not optional)
  const totalCost = recipe
    .filter(item => !item.isOptional)
    .reduce((sum, item) => sum + item.calculatedCost, 0);

  // Update product
  const stmt = db.prepare('UPDATE Product SET unitCost = ?, updatedAt = ? WHERE id = ?');
  stmt.run(totalCost, new Date().toISOString(), productId);
}

/**
 * Get recipe summary with total cost
 */
export function getRecipeSummary(productId: string): {
  items: ProductRecipeItem[];
  totalRequiredCost: number;
  totalOptionalCost: number;
  totalCost: number;
} {
  const items = getProductRecipe(productId);

  const totalRequiredCost = items
    .filter(item => !item.isOptional)
    .reduce((sum, item) => sum + item.calculatedCost, 0);

  const totalOptionalCost = items
    .filter(item => item.isOptional)
    .reduce((sum, item) => sum + item.calculatedCost, 0);

  return {
    items,
    totalRequiredCost,
    totalOptionalCost,
    totalCost: totalRequiredCost + totalOptionalCost,
  };
}

/**
 * Alias for getProductRecipe (for API compatibility)
 */
export function getRecipeWithMaterials(productId: string): ProductRecipeItem[] {
  return getProductRecipe(productId);
}

/**
 * Alias for deleteProductRecipe (for API compatibility)
 */
export function clearProductRecipe(productId: string): boolean {
  return deleteProductRecipe(productId);
}
