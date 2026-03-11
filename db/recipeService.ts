import { db, initDatabase } from './init';
import { getMaterial } from './materialService';
import { getProduct } from './productService';
import { v4 as uuidv4 } from 'uuid';

// Ensure database is initialized
initDatabase();

export interface ProductRecipeItem {
  id: string;
  productId: string;
  itemType: 'material' | 'product';
  materialId?: string;
  linkedProductId?: string;
  materialName?: string; // populated in queries
  materialCategory?: string; // populated in queries
  linkedProductName?: string; // populated in queries for linked products
  linkedProductSku?: string; // populated in queries for linked products
  purchaseUnit?: string; // populated in queries
  costPerUnit?: number; // populated in queries
  quantity: number;
  unit: string;
  calculatedCost: number;
  isOptional: boolean;
  selectionGroup?: string; // Items in same group are mutually exclusive (XOR choice)
  sortOrder: number;
  createdAt: string;
}

/**
 * Add a recipe item to a product
 */
export function addRecipeItem(item: {
  productId: string;
  itemType?: 'material' | 'product';
  materialId?: string;
  linkedProductId?: string;
  quantity: number;
  unit: string;
  isOptional?: boolean;
  selectionGroup?: string;
  sortOrder?: number;
}): ProductRecipeItem {
  const id = uuidv4();
  const now = new Date().toISOString();
  const itemType = item.itemType || 'material';

  let calculatedCost = 0;

  if (itemType === 'material') {
    if (!item.materialId) {
      throw new Error('materialId is required for material items');
    }
    // Get material to calculate cost
    const material = getMaterial(item.materialId);
    if (!material) {
      throw new Error(`Material ${item.materialId} not found`);
    }
    calculatedCost = item.quantity * material.costPerUnit;
  } else if (itemType === 'product') {
    if (!item.linkedProductId) {
      throw new Error('linkedProductId is required for product items');
    }
    // Get linked product to calculate cost
    const linkedProduct = getProduct(item.linkedProductId);
    if (!linkedProduct) {
      throw new Error(`Linked product ${item.linkedProductId} not found`);
    }
    calculatedCost = item.quantity * linkedProduct.unitCost;
  }

  const stmt = db.prepare(`
    INSERT INTO ProductRecipe
    (id, productId, itemType, materialId, linkedProductId, quantity, unit, calculatedCost, isOptional, selectionGroup, sortOrder, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    item.productId,
    itemType,
    item.materialId || null,
    item.linkedProductId || null,
    item.quantity,
    item.unit,
    calculatedCost,
    item.isOptional ? 1 : 0,
    item.selectionGroup || null,
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
    SELECT pr.*,
           m.name as materialName,
           m.category as materialCategory,
           m.purchaseUnit as purchaseUnit,
           m.costPerUnit as costPerUnit,
           p.name as linkedProductName,
           p.sku as linkedProductSku,
           p.unitCost as linkedProductCost
    FROM ProductRecipe pr
    LEFT JOIN Material m ON pr.materialId = m.id
    LEFT JOIN Product p ON pr.linkedProductId = p.id
    WHERE pr.id = ?
  `);
  const row = stmt.get(id) as any;
  if (!row) return undefined;

  return {
    id: row.id,
    productId: row.productId,
    itemType: row.itemType || 'material',
    materialId: row.materialId,
    linkedProductId: row.linkedProductId,
    materialName: row.materialName,
    materialCategory: row.materialCategory,
    linkedProductName: row.linkedProductName,
    linkedProductSku: row.linkedProductSku,
    purchaseUnit: row.purchaseUnit,
    costPerUnit: row.costPerUnit || row.linkedProductCost,
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
    SELECT pr.*,
           m.name as materialName,
           m.category as materialCategory,
           m.purchaseUnit as purchaseUnit,
           m.costPerUnit as costPerUnit,
           p.name as linkedProductName,
           p.sku as linkedProductSku,
           p.unitCost as linkedProductCost
    FROM ProductRecipe pr
    LEFT JOIN Material m ON pr.materialId = m.id
    LEFT JOIN Product p ON pr.linkedProductId = p.id
    WHERE pr.productId = ?
    ORDER BY pr.sortOrder, pr.createdAt
  `);

  const rows = stmt.all(productId) as any[];
  return rows.map(row => ({
    id: row.id,
    productId: row.productId,
    itemType: row.itemType || 'material',
    materialId: row.materialId,
    linkedProductId: row.linkedProductId,
    materialName: row.materialName,
    materialCategory: row.materialCategory,
    linkedProductName: row.linkedProductName,
    linkedProductSku: row.linkedProductSku,
    purchaseUnit: row.purchaseUnit,
    costPerUnit: row.costPerUnit || row.linkedProductCost,
    quantity: row.quantity,
    unit: row.unit,
    calculatedCost: row.calculatedCost,
    isOptional: row.isOptional === 1,
    selectionGroup: row.selectionGroup,
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
  let calculatedCost = 0;

  if (existing.itemType === 'material') {
    const material = getMaterial(existing.materialId!);
    if (!material) {
      throw new Error(`Material ${existing.materialId} not found`);
    }
    calculatedCost = quantity * material.costPerUnit;
  } else if (existing.itemType === 'product') {
    const linkedProduct = getProduct(existing.linkedProductId!);
    if (!linkedProduct) {
      throw new Error(`Linked product ${existing.linkedProductId} not found`);
    }
    calculatedCost = quantity * linkedProduct.unitCost;
  }

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
    itemType?: 'material' | 'product';
    materialId?: string;
    linkedProductId?: string;
    quantity: number;
    unit: string;
    isOptional?: boolean;
    selectionGroup?: string;
  }>
): ProductRecipeItem[] {
  // Delete existing recipe
  deleteProductRecipe(productId);

  // Add new items
  const recipeItems: ProductRecipeItem[] = [];
  items.forEach((item, index) => {
    const recipeItem = addRecipeItem({
      productId,
      itemType: item.itemType || 'material',
      materialId: item.materialId,
      linkedProductId: item.linkedProductId,
      quantity: item.quantity,
      unit: item.unit,
      isOptional: item.isOptional,
      selectionGroup: item.selectionGroup,
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

  const productIds = new Set<string>();
  items.forEach(item => {
    productIds.add(item.productId);
  });

  // Update all affected products' total costs (this will recursively update)
  productIds.forEach(productId => {
    updateProductTotalCost(productId);
  });

  console.log(`♻️  Recalculated costs for ${items.length} recipe items across ${productIds.size} products`);
}

/**
 * Recalculate all product costs in dependency order
 * This ensures linked products are calculated before products that use them
 */
export function recalculateAllProductCosts(): void {
  const allProducts = db.prepare('SELECT id FROM Product').all() as Array<{ id: string }>;

  console.log(`♻️  Recalculating costs for ${allProducts.length} products...`);

  // Process all products - the updateProductTotalCost function handles dependencies
  allProducts.forEach(({ id }) => {
    updateProductTotalCost(id);
  });

  console.log(`✅ All product costs recalculated`);
}

/**
 * Update product's total cost based on recipe (with recursive linked product support)
 */
export function updateProductTotalCost(productId: string, visited = new Set<string>()): void {
  // Prevent infinite loops
  if (visited.has(productId)) {
    return;
  }
  visited.add(productId);

  const recipe = getProductRecipe(productId);

  // First, ensure all linked products have updated costs
  recipe.forEach(item => {
    if (item.itemType === 'product' && item.linkedProductId) {
      updateProductTotalCost(item.linkedProductId, visited);
    }
  });

  // Now recalculate this product's recipe items with fresh linked product costs
  const updateStmt = db.prepare('UPDATE ProductRecipe SET calculatedCost = ? WHERE id = ?');

  recipe.forEach(item => {
    let newCost = 0;

    if (item.itemType === 'material' && item.materialId) {
      const material = getMaterial(item.materialId);
      if (material) {
        newCost = item.quantity * material.costPerUnit;
      }
    } else if (item.itemType === 'product' && item.linkedProductId) {
      const linkedProduct = getProduct(item.linkedProductId);
      if (linkedProduct) {
        // Use the freshly calculated unitCost
        newCost = item.quantity * linkedProduct.unitCost;
      }
    }

    updateStmt.run(newCost, item.id);
  });

  // Reload recipe with updated costs
  const updatedRecipe = getProductRecipe(productId);

  // Sum only required items (not optional)
  const totalCost = updatedRecipe
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
