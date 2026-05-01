import { supabase } from './supabase';
import { db } from './db/init';

export async function syncProduct(productId: string) {
  const product = db.prepare('SELECT * FROM Product WHERE id = ?').get(productId) as any;
  if (!product) return;

  const payload = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    base_price: product.basePrice,
    image_url: product.imageUrl,
    combo_price_override: product.comboPriceOverride,
    available_online: true,
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
}

export async function syncAllProducts() {
  const products = db.prepare('SELECT * FROM Product ORDER BY name').all() as any[];
  let synced = 0;
  let failed = 0;

  const rows = products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    base_price: p.basePrice,
    image_url: p.imageUrl,
    combo_price_override: p.comboPriceOverride,
    available_online: true,
    updated_at: new Date().toISOString(),
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
