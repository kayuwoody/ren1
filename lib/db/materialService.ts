import { db, initDatabase } from './init';
import { v4 as uuidv4 } from 'uuid';

// Ensure database is initialized
initDatabase();

export interface Material {
  id: string;
  name: string;
  category: 'ingredient' | 'packaging' | 'consumable';
  purchaseUnit: string; // e.g., 'g', 'ml', 'piece'
  purchaseQuantity: number; // e.g., 500 (for 500g bag)
  purchaseCost: number; // e.g., 75 (RM 75 per 500g)
  costPerUnit: number; // auto-calculated: purchaseCost / purchaseQuantity
  stockQuantity: number;
  lowStockThreshold: number;
  supplier?: string;
  lastPurchaseDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialPriceHistory {
  id: string;
  materialId: string;
  previousCost: number;
  newCost: number;
  previousCostPerUnit: number;
  newCostPerUnit: number;
  purchaseQuantity: number;
  notes?: string;
  changedAt: string;
}

/**
 * Create or update a material
 */
export function upsertMaterial(
  material: Omit<Material, 'id' | 'costPerUnit' | 'createdAt' | 'updatedAt'> & { id?: string }
): Material {
  const id = material.id || uuidv4();
  const now = new Date().toISOString();
  const costPerUnit = material.purchaseCost / material.purchaseQuantity;

  // Check if material exists
  const existing = material.id
    ? db.prepare('SELECT * FROM Material WHERE id = ?').get(material.id) as Material | undefined
    : null;

  if (existing) {
    // Update existing material
    const stmt = db.prepare(`
      UPDATE Material
      SET name = ?, category = ?, purchaseUnit = ?, purchaseQuantity = ?,
          purchaseCost = ?, costPerUnit = ?, stockQuantity = ?, lowStockThreshold = ?,
          supplier = ?, lastPurchaseDate = ?, updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(
      material.name,
      material.category,
      material.purchaseUnit,
      material.purchaseQuantity,
      material.purchaseCost,
      costPerUnit,
      material.stockQuantity,
      material.lowStockThreshold,
      material.supplier || null,
      material.lastPurchaseDate || null,
      now,
      id
    );

    // Record price change if cost changed
    if (existing.costPerUnit !== costPerUnit) {
      recordPriceChange(id, existing.purchaseCost, material.purchaseCost, existing.costPerUnit, costPerUnit, material.purchaseQuantity);
    }
  } else {
    // Insert new material
    const stmt = db.prepare(`
      INSERT INTO Material (id, name, category, purchaseUnit, purchaseQuantity, purchaseCost,
                           costPerUnit, stockQuantity, lowStockThreshold, supplier, lastPurchaseDate,
                           createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      material.name,
      material.category,
      material.purchaseUnit,
      material.purchaseQuantity,
      material.purchaseCost,
      costPerUnit,
      material.stockQuantity,
      material.lowStockThreshold,
      material.supplier || null,
      material.lastPurchaseDate || null,
      now,
      now
    );
  }

  return getMaterial(id)!;
}

/**
 * Update material price and trigger recipe recalculation
 */
export function updateMaterialPrice(
  materialId: string,
  purchaseQuantity: number,
  purchaseCost: number,
  notes?: string
): Material {
  const existing = getMaterial(materialId);
  if (!existing) {
    throw new Error(`Material ${materialId} not found`);
  }

  const newCostPerUnit = purchaseCost / purchaseQuantity;
  const now = new Date().toISOString();

  // Update material
  const stmt = db.prepare(`
    UPDATE Material
    SET purchaseQuantity = ?, purchaseCost = ?, costPerUnit = ?,
        lastPurchaseDate = ?, updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(purchaseQuantity, purchaseCost, newCostPerUnit, now, now, materialId);

  // Record price change
  recordPriceChange(
    materialId,
    existing.purchaseCost,
    purchaseCost,
    existing.costPerUnit,
    newCostPerUnit,
    purchaseQuantity,
    notes
  );

  return getMaterial(materialId)!;
}

/**
 * Record price change in history
 */
function recordPriceChange(
  materialId: string,
  previousCost: number,
  newCost: number,
  previousCostPerUnit: number,
  newCostPerUnit: number,
  purchaseQuantity: number,
  notes?: string
): void {
  const stmt = db.prepare(`
    INSERT INTO MaterialPriceHistory
    (id, materialId, previousCost, newCost, previousCostPerUnit, newCostPerUnit,
     purchaseQuantity, notes, changedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    uuidv4(),
    materialId,
    previousCost,
    newCost,
    previousCostPerUnit,
    newCostPerUnit,
    purchaseQuantity,
    notes || null,
    new Date().toISOString()
  );
}

/**
 * Get material by ID
 */
export function getMaterial(id: string): Material | undefined {
  const stmt = db.prepare('SELECT * FROM Material WHERE id = ?');
  return stmt.get(id) as Material | undefined;
}

/**
 * Get all materials
 */
export function getAllMaterials(): Material[] {
  const stmt = db.prepare('SELECT * FROM Material ORDER BY category, name');
  return stmt.all() as Material[];
}

/**
 * Get materials by category
 */
export function getMaterialsByCategory(category: string): Material[] {
  const stmt = db.prepare('SELECT * FROM Material WHERE category = ? ORDER BY name');
  return stmt.all(category) as Material[];
}

/**
 * List materials with optional category filter (alias for API)
 */
export function listMaterials(category?: 'ingredient' | 'packaging' | 'consumable'): Material[] {
  if (category) {
    return getMaterialsByCategory(category);
  }
  return getAllMaterials();
}

/**
 * Delete material
 */
export function deleteMaterial(id: string): boolean {
  const stmt = db.prepare('DELETE FROM Material WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Get price history for a material
 */
export function getMaterialPriceHistory(materialId: string): MaterialPriceHistory[] {
  const stmt = db.prepare(`
    SELECT * FROM MaterialPriceHistory
    WHERE materialId = ?
    ORDER BY changedAt DESC
  `);
  return stmt.all(materialId) as MaterialPriceHistory[];
}

/**
 * Update material stock
 */
export function updateMaterialStock(materialId: string, quantity: number): Material {
  const stmt = db.prepare(`
    UPDATE Material
    SET stockQuantity = ?, updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(quantity, new Date().toISOString(), materialId);
  return getMaterial(materialId)!;
}

/**
 * Get materials with low stock
 */
export function getLowStockMaterials(): Material[] {
  const stmt = db.prepare(`
    SELECT * FROM Material
    WHERE stockQuantity <= lowStockThreshold
    ORDER BY category, name
  `);
  return stmt.all() as Material[];
}
