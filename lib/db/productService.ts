import { db } from './init';
import { v4 as uuidv4 } from 'uuid';

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
  comboPriceOverride?: number;
  supplier?: string;
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
    // Update existing product
    const stmt = db.prepare(`
      UPDATE Product
      SET wcId = ?, name = ?, sku = ?, category = ?, basePrice = ?,
          supplierCost = ?, unitCost = ?, stockQuantity = ?, manageStock = ?, supplier = ?, imageUrl = ?, updatedAt = ?
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
      product.stockQuantity,
      product.manageStock ? 1 : 0,
      product.supplier || null,
      product.imageUrl || null,
      now,
      id
    );
  } else {
    // Insert new product
    const stmt = db.prepare(`
      INSERT INTO Product (id, wcId, name, sku, category, basePrice, supplierCost, unitCost,
                          stockQuantity, manageStock, supplier, imageUrl, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      product.stockQuantity,
      product.manageStock ? 1 : 0,
      product.supplier || null,
      product.imageUrl || null,
      now,
      now
    );
  }

  return getProduct(id)!;
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
  return result.changes > 0;
}

/**
 * Sync product from WooCommerce
 */
export function syncProductFromWooCommerce(wcProduct: any): Product {
  // Check if product already exists to preserve local fields
  const existing = getProductByWcId(wcProduct.id);

  const supplierCost = existing?.supplierCost ?? 0;
  const unitCost = existing?.unitCost ?? 0;
  const supplier = existing?.supplier ?? undefined; // Preserve supplier

  // Debug logging for supplier sync
  if (existing?.supplier) {
    console.log(`🔄 Syncing ${wcProduct.name} - Preserving supplier: "${existing.supplier}"`);
  }

  // PRESERVE local SQLite stock as source of truth
  // SQLite is updated when orders are paid (via consumption API)
  // Only use WooCommerce stock for NEW products that don't exist in SQLite yet
  const stockQuantity = existing?.stockQuantity ?? (wcProduct.manage_stock ? (wcProduct.stock_quantity ?? 0) : 0);

  // Debug logging for stock preservation
  if (existing && wcProduct.manage_stock) {
    const localStock = existing.stockQuantity ?? 0;
    const wcStock = wcProduct.stock_quantity ?? 0;
    if (localStock !== wcStock) {
      console.log(`📦 Stock preservation for "${wcProduct.name}": Local=${localStock} (KEPT), WC=${wcStock} (ignored)`);
    }
  }

  if (existing && (supplierCost > 0 || unitCost > 0)) {
    console.log(`🔄 Syncing ${wcProduct.name} - Preserving: supplierCost=RM${supplierCost}, unitCost=RM${unitCost}, stock=${stockQuantity}`);
  }

  const result = upsertProduct({
    id: undefined, // Will be auto-generated or matched by wcId
    wcId: wcProduct.id,
    name: wcProduct.name,
    sku: wcProduct.sku,
    category: wcProduct.categories?.[0]?.slug || 'uncategorized',
    basePrice: parseFloat(wcProduct.price) || 0,
    supplierCost, // Preserve existing supplierCost (local field)
    unitCost, // Preserve existing unitCost from recipes
    stockQuantity, // Use WooCommerce stock as source of truth
    manageStock: wcProduct.manage_stock ?? false, // Store whether WooCommerce tracks inventory
    supplier, // Preserve existing supplier (local field)
    imageUrl: wcProduct.images?.[0]?.src,
  });

  if (existing && (supplierCost > 0 || unitCost > 0)) {
    console.log(`   ✅ After sync - supplierCost=RM${result.supplierCost}, unitCost=RM${result.unitCost}, stock=${result.stockQuantity}`);
  }

  // Debug: Verify supplier was preserved
  if (existing?.supplier && result.supplier !== existing.supplier) {
    console.error(`❌ BUG: Supplier lost during sync! Before: "${existing.supplier}", After: "${result.supplier}"`);
  } else if (existing?.supplier) {
    console.log(`   ✅ Supplier preserved: "${result.supplier}"`);
  }

  return result;
}
