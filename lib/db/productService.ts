import { db } from './init';
import { v4 as uuidv4 } from 'uuid';
import { initBranchStockForItem } from './branchStockService';
import { syncProduct, syncProductDelete } from '../catalogSync';

export interface Product {
  id: string;
  wcId?: number;
  name: string;
  sku: string;
  category: string;
  basePrice: number;
  supplierCost: number;
  unitCost: number;
  stockQuantity: number;
  manageStock: boolean;
  availableOnline: boolean;
  comboPriceOverride?: number;
  supplier?: string;
  supplierProductName?: string;
  staffPrice?: number;
  quantityPerCarton?: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get product by ID
 */
export function getProduct(id: string): Product | undefined {
  const stmt = db.prepare('SELECT * FROM Product WHERE id = ?');
  return stmt.get(id) as Product | undefined;
}

/**
 * Get product by WooCommerce ID
 */
export function getProductByWcId(wcId: number): Product | undefined {
  const stmt = db.prepare('SELECT * FROM Product WHERE wcId = ?');
  return stmt.get(wcId) as Product | undefined;
}

/**
 * Get product by SKU
 */
export function getProductBySku(sku: string): Product | undefined {
  const stmt = db.prepare('SELECT * FROM Product WHERE sku = ?');
  return stmt.get(sku) as Product | undefined;
}

/**
 * Get all products
 */
export function getAllProducts(): Product[] {
  const stmt = db.prepare('SELECT * FROM Product ORDER BY name');
  return stmt.all() as Product[];
}

/**
 * Get products by category
 */
export function getProductsByCategory(category: string): Product[] {
  const stmt = db.prepare('SELECT * FROM Product WHERE category = ? ORDER BY name');
  return stmt.all(category) as Product[];
}

/**
 * Create or update product
 */
export function upsertProduct(
  product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Product {
  const now = new Date().toISOString();

  // Check if product exists by ID, wcId, or SKU
  let existing: Product | undefined;

  if (product.id) {
    existing = db.prepare('SELECT * FROM Product WHERE id = ?').get(product.id) as Product | undefined;
  }

  if (!existing && product.wcId) {
    existing = db.prepare('SELECT * FROM Product WHERE wcId = ?').get(product.wcId) as Product | undefined;
  }

  // Only check by SKU if it's not empty (avoid matching multiple products with empty SKUs)
  if (!existing && product.sku && product.sku.trim() !== '') {
    existing = db.prepare('SELECT * FROM Product WHERE sku = ?').get(product.sku) as Product | undefined;
  }

  const id = existing?.id || product.id || uuidv4();

  // Generate a unique SKU if empty (to avoid UNIQUE constraint failures)
  const sku = (product.sku && product.sku.trim() !== '') ? product.sku : `product-${product.wcId || id}`;

  if (existing) {
    // Update existing product — do NOT write stockQuantity (managed by BranchStock)
    const stmt = db.prepare(`
      UPDATE Product
      SET wcId = ?, name = ?, sku = ?, category = ?, basePrice = ?,
          supplierCost = ?, unitCost = ?, manageStock = ?, availableOnline = ?,
          supplier = ?, supplierProductName = ?, staffPrice = ?,
          quantityPerCarton = ?, imageUrl = ?, updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(
      product.wcId || null,
      product.name,
      sku,
      product.category,
      product.basePrice,
      product.supplierCost,
      product.unitCost,
      product.manageStock ? 1 : 0,
      product.availableOnline ? 1 : 0,
      product.supplier || null,
      product.supplierProductName || null,
      product.staffPrice ?? null,
      product.quantityPerCarton || null,
      product.imageUrl || null,
      now,
      id
    );
  } else {
    // Insert new product — stockQuantity defaults to 0 (real stock lives in BranchStock)
    const stmt = db.prepare(`
      INSERT INTO Product (id, wcId, name, sku, category, basePrice, supplierCost, unitCost,
                          stockQuantity, manageStock, availableOnline, supplier, supplierProductName, staffPrice,
                          quantityPerCarton, imageUrl, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      product.wcId || null,
      product.name,
      sku,
      product.category,
      product.basePrice,
      product.supplierCost,
      product.unitCost,
      product.manageStock ? 1 : 0,
      product.availableOnline ? 1 : 0,
      product.supplier || null,
      product.supplierProductName || null,
      product.staffPrice ?? null,
      product.quantityPerCarton || null,
      product.imageUrl || null,
      now,
      now
    );

    // Create BranchStock entries for the new product across all active branches
    if (product.manageStock) {
      initBranchStockForItem('product', id);
    }
  }

  const saved = getProduct(id)!;
  syncProduct(id).catch(() => {});
  return saved;
}

export function setProductAvailableOnline(id: string, availableOnline: boolean): boolean {
  const stmt = db.prepare('UPDATE Product SET availableOnline = ?, updatedAt = ? WHERE id = ?');
  const result = stmt.run(availableOnline ? 1 : 0, new Date().toISOString(), id);
  if (result.changes > 0) {
    syncProduct(id).catch(() => {});
  }
  return result.changes > 0;
}

/**
 * Update product cost (called by recipe service)
 */
export function updateProductCost(id: string, unitCost: number): void {
  const stmt = db.prepare('UPDATE Product SET unitCost = ?, updatedAt = ? WHERE id = ?');
  stmt.run(unitCost, new Date().toISOString(), id);
}

/**
 * Delete product
 */
export function deleteProduct(id: string): boolean {
  const stmt = db.prepare('DELETE FROM Product WHERE id = ?');
  const result = stmt.run(id);
  if (result.changes > 0) {
    syncProductDelete(id).catch(() => {});
  }
  return result.changes > 0;
}
