/**
 * Material Service
 * Manages ingredients, packaging, and consumables (coffee beans, milk, cups, lids, etc.)
 */

import db from './init';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Types
// ============================================================================

export interface Material {
  id: string;
  name: string;
  category: 'ingredient' | 'packaging' | 'consumable';
  purchaseUnit: string; // 'g' | 'ml' | 'unit' | 'kg' | 'L'
  purchaseQuantity: number; // e.g., 500 (for 500g bag)
  purchaseCost: number; // e.g., 75 (RM 75 per 500g bag)
  costPerUnit: number; // Calculated: purchaseCost / purchaseQuantity
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
  purchaseQuantity: number;
  purchaseCost: number;
  costPerUnit: number;
  effectiveDate: string;
  notes?: string;
}

// ============================================================================
// Material CRUD Operations
// ============================================================================

/**
 * Create or update a material
 * Automatically calculates costPerUnit
 */
export function upsertMaterial(
  material: Omit<Material, 'id' | 'costPerUnit' | 'createdAt' | 'updatedAt'> & { id?: string }
): Material {
  const id = material.id || uuidv4();
  const now = new Date().toISOString();

  // Calculate cost per unit
  const costPerUnit = material.purchaseCost / material.purchaseQuantity;

  const stmt = db.prepare(`
    INSERT INTO Material (
      id, name, category, purchaseUnit, purchaseQuantity, purchaseCost,
      costPerUnit, stockQuantity, lowStockThreshold, supplier, lastPurchaseDate,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      purchaseUnit = excluded.purchaseUnit,
      purchaseQuantity = excluded.purchaseQuantity,
      purchaseCost = excluded.purchaseCost,
      costPerUnit = excluded.costPerUnit,
      stockQuantity = excluded.stockQuantity,
      lowStockThreshold = excluded.lowStockThreshold,
      supplier = excluded.supplier,
      lastPurchaseDate = excluded.lastPurchaseDate,
      updatedAt = excluded.updatedAt
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

  // If this is a price change, record in history
  const existing = getMaterial(id);
  if (existing && existing.costPerUnit !== costPerUnit) {
    recordPriceChange(id, material.purchaseQuantity, material.purchaseCost, costPerUnit);
  }

  return getMaterial(id)!;
}

/**
 * Get material by ID
 */
export function getMaterial(id: string): Material | null {
  const stmt = db.prepare('SELECT * FROM Material WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) return null;

  return row as Material;
}

/**
 * Get material by name
 */
export function getMaterialByName(name: string): Material | null {
  const stmt = db.prepare('SELECT * FROM Material WHERE name = ? COLLATE NOCASE');
  const row = stmt.get(name) as any;

  if (!row) return null;

  return row as Material;
}

/**
 * List all materials
 */
export function listMaterials(category?: Material['category']): Material[] {
  let query = 'SELECT * FROM Material';
  const params: any[] = [];

  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }

  query += ' ORDER BY category, name';

  const stmt = db.prepare(query);
  return stmt.all(...params) as Material[];
}

/**
 * List materials by category
 */
export function listMaterialsByCategory(category: Material['category']): Material[] {
  const stmt = db.prepare('SELECT * FROM Material WHERE category = ? ORDER BY name');
  return stmt.all(category) as Material[];
}

/**
 * Update material price
 * Records price history automatically
 */
export function updateMaterialPrice(
  materialId: string,
  purchaseQuantity: number,
  purchaseCost: number,
  notes?: string
): Material {
  const costPerUnit = purchaseCost / purchaseQuantity;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE Material
    SET purchaseQuantity = ?,
        purchaseCost = ?,
        costPerUnit = ?,
        lastPurchaseDate = ?,
        updatedAt = ?
    WHERE id = ?
  `);

  stmt.run(purchaseQuantity, purchaseCost, costPerUnit, now, now, materialId);

  // Record price change
  recordPriceChange(materialId, purchaseQuantity, purchaseCost, costPerUnit, notes);

  return getMaterial(materialId)!;
}

/**
 * Update material stock
 */
export function updateMaterialStock(materialId: string, newQuantity: number): void {
  const stmt = db.prepare(`
    UPDATE Material
    SET stockQuantity = ?, updatedAt = datetime('now')
    WHERE id = ?
  `);

  stmt.run(newQuantity, materialId);
}

/**
 * Delete material
 */
export function deleteMaterial(id: string): void {
  const stmt = db.prepare('DELETE FROM Material WHERE id = ?');
  stmt.run(id);
}

// ============================================================================
// Price History Operations
// ============================================================================

/**
 * Record a price change in history
 */
function recordPriceChange(
  materialId: string,
  purchaseQuantity: number,
  purchaseCost: number,
  costPerUnit: number,
  notes?: string
): void {
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO MaterialPriceHistory (
      id, materialId, purchaseQuantity, purchaseCost, costPerUnit, effectiveDate, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, materialId, purchaseQuantity, purchaseCost, costPerUnit, now, notes || null);
}

/**
 * Get price history for a material
 */
export function getMaterialPriceHistory(
  materialId: string,
  limit: number = 10
): MaterialPriceHistory[] {
  const stmt = db.prepare(`
    SELECT * FROM MaterialPriceHistory
    WHERE materialId = ?
    ORDER BY effectiveDate DESC
    LIMIT ?
  `);

  return stmt.all(materialId, limit) as MaterialPriceHistory[];
}

/**
 * Get low stock materials
 */
export function getLowStockMaterials(): Material[] {
  const stmt = db.prepare(`
    SELECT * FROM Material
    WHERE stockQuantity <= lowStockThreshold
    ORDER BY stockQuantity ASC
  `);

  return stmt.all() as Material[];
}
