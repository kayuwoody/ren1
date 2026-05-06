import { supabase } from './supabase';
import { db } from './db/init';

function buildSelectionConfig(productId: string) {
  // Dynamic require to avoid circular dependency (catalogSync → recursiveProductExpansion → productService → catalogSync)
  const { flattenAllChoices } = require('./db/recursiveProductExpansion');
  const { xorGroups, optionalItems } = flattenAllChoices(productId);

  if (xorGroups.length === 0 && optionalItems.length === 0) return null;

  return { xorGroups, optionalItems };
}

function getProductStockQuantity(productId: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(stockQuantity), 0) as total
    FROM BranchStock
    WHERE itemType = 'product' AND itemId = ?
  `).get(productId) as { total: number };
  return row.total;
}

export async function syncProduct(productId: string) {
  const product = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId) as any;
  if (!product) return;

  const selectionConfig = buildSelectionConfig(productId);

  const payload = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    base_price: product.basePrice,
    image_url: product.imageUrl,
    combo_price_override: product.comboPriceOverride,
    selection_config: selectionConfig,
    stock_quantity: product.manageStock ? getProductStockQuantity(productId) : null,
    available_online: !!product.availableOnline,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.warn(`Catalog sync failed for product ${productId}:`, error.message);
  }
}

export async function syncProductDelete(productId: string) {
  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) {
    console.warn(`Catalog sync delete failed for product ${productId}:`, error.message);
  }
}

export async function syncRecipe(productId: string) {
  const items = db.prepare(`
    SELECT pr.*, p.name as linkedProductName
    FROM ProductRecipe pr
    LEFT JOIN Product p ON pr.linkedProductId = p.id
    WHERE pr.productId = ?
    ORDER BY pr.sortOrder ASC
  `).all(productId) as any[];

  const { error: delError } = await supabase
    .from('product_recipe_items')
    .delete()
    .eq('product_id', productId);

  if (delError) {
    console.warn(`Catalog sync: failed to clear recipe for ${productId}:`, delError.message);
    return;
  }

  if (items.length > 0) {
    const rows = items.map(item => ({
      id: item.id,
      product_id: item.productId,
      item_type: item.itemType,
      linked_product_id: item.linkedProductId,
      linked_product_name: item.linkedProductName || null,
      quantity: item.quantity,
      unit: item.unit,
      is_optional: item.isOptional === 1,
      selection_group: item.selectionGroup,
      price_adjustment: item.priceAdjustment,
      sort_order: item.sortOrder,
    }));

    const { error } = await supabase.from('product_recipe_items').insert(rows);
    if (error) {
      console.warn(`Catalog sync: failed to insert recipe for ${productId}:`, error.message);
    }
  }

  // Re-sync the product's selection_config (flattened choices depend on recipe)
  const selectionConfig = buildSelectionConfig(productId);
  const { error: configErr } = await supabase
    .from('products')
    .update({ selection_config: selectionConfig, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (configErr) {
    console.warn(`Catalog sync: failed to update selection_config for ${productId}:`, configErr.message);
  }
}

export async function syncAllProducts() {
  const products = db.prepare('SELECT * FROM Product ORDER BY name').all() as any[];
  let synced = 0;
  let failed = 0;

  const now = new Date().toISOString();
  const rows = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    base_price: p.basePrice,
    image_url: p.imageUrl,
    combo_price_override: p.comboPriceOverride,
    selection_config: buildSelectionConfig(p.id),
    stock_quantity: p.manageStock ? getProductStockQuantity(p.id) : null,
    available_online: !!p.availableOnline,
    updated_at: now,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    try {
      const { error } = await supabase.from('products').upsert(batch, { onConflict: 'id' });
      if (error) throw error;
      synced += batch.length;
    } catch (err) {
      console.error('Batch product sync failed:', err);
      failed += batch.length;
    }
  }

  return { synced, failed, total: products.length };
}

export async function syncAllRecipes() {
  const products = db.prepare('SELECT id FROM Product').all() as any[];
  let synced = 0;
  let failed = 0;

  for (const product of products) {
    try {
      await syncRecipe(product.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed, total: products.length };
}

export async function syncProductStock(productId: string) {
  const product = db.prepare('SELECT id, manageStock FROM Product WHERE id = ?').get(productId) as any;
  if (!product || !product.manageStock) return;

  const stockQuantity = getProductStockQuantity(productId);
  const { error } = await supabase
    .from('products')
    .update({ stock_quantity: stockQuantity, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (error) {
    console.warn(`Stock sync failed for product ${productId}:`, error.message);
  }
}

export async function syncAllStock() {
  const products = db.prepare('SELECT id FROM Product WHERE manageStock = 1').all() as any[];
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i += 50) {
    const batch = products.slice(i, i + 50);
    const rows = batch.map(p => ({
      id: p.id,
      stock_quantity: getProductStockQuantity(p.id),
      updated_at: new Date().toISOString(),
    }));

    try {
      const { error } = await supabase.from('products').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      synced += batch.length;
    } catch (err) {
      console.error('Batch stock sync failed:', err);
      failed += batch.length;
    }
  }

  return { synced, failed, total: products.length };
}

export async function syncBranch(branchId: string) {
  const branch = db.prepare('SELECT * FROM Branch WHERE id = ?').get(branchId) as any;
  if (!branch) return;

  const payload = {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address || null,
    phone: branch.phone || null,
    is_active: branch.isActive === 1,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('branches').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.warn(`Branch sync failed for ${branchId}:`, error.message);
  }
}

export async function syncAllBranches() {
  const branches = db.prepare('SELECT * FROM Branch WHERE isActive = 1').all() as any[];
  let synced = 0;
  let failed = 0;

  const rows = branches.map(b => ({
    id: b.id,
    name: b.name,
    code: b.code,
    address: b.address || null,
    phone: b.phone || null,
    is_active: b.isActive === 1,
    updated_at: new Date().toISOString(),
  }));

  try {
    const { error } = await supabase.from('branches').upsert(rows, { onConflict: 'id' });
    if (error) throw error;
    synced = rows.length;
  } catch (err) {
    console.error('Branch sync failed:', err);
    failed = rows.length;
  }

  return { synced, failed, total: branches.length };
}
