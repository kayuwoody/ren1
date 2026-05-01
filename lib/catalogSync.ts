import { supabase } from './supabase';
import { db } from './db/init';

interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'upsert' | 'delete';
  payload: string;
  created_at: string;
  attempts: number;
}

function ensureSyncQueueTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      attempts INTEGER NOT NULL DEFAULT 0
    )
  `);
}

function enqueue(tableName: string, recordId: string, operation: 'upsert' | 'delete', payload: object) {
  ensureSyncQueueTable();
  const id = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`
    INSERT INTO _sync_queue (id, table_name, record_id, operation, payload)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, tableName, recordId, operation, JSON.stringify(payload));
}

async function processQueue() {
  ensureSyncQueueTable();
  const items = db.prepare(`
    SELECT * FROM _sync_queue WHERE attempts < 5 ORDER BY created_at ASC LIMIT 20
  `).all() as SyncQueueItem[];

  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload);

      if (item.operation === 'upsert') {
        const { error } = await supabase.from(item.table_name).upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      } else if (item.operation === 'delete') {
        const { error } = await supabase.from(item.table_name).delete().eq('id', item.record_id);
        if (error) throw error;
      }

      db.prepare('DELETE FROM _sync_queue WHERE id = ?').run(item.id);
    } catch (err) {
      console.error(`Sync failed for ${item.table_name}/${item.record_id}:`, err);
      db.prepare('UPDATE _sync_queue SET attempts = attempts + 1 WHERE id = ?').run(item.id);
    }
  }

  return items.length;
}

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

  try {
    const { error } = await supabase.from('products').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
  } catch {
    enqueue('products', product.id, 'upsert', payload);
  }
}

export async function syncProductDelete(productId: string) {
  try {
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) throw error;
  } catch {
    enqueue('products', productId, 'delete', {});
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

  try {
    await supabase.from('product_recipe_items').delete().eq('product_id', productId);

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
      if (error) throw error;
    }
  } catch {
    enqueue('product_recipe_items', productId, 'upsert', { product_id: productId, _full_sync: true });
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

  // Upsert in batches of 50
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

export async function flushSyncQueue() {
  let totalProcessed = 0;
  let batch = await processQueue();
  while (batch > 0) {
    totalProcessed += batch;
    batch = await processQueue();
  }
  return totalProcessed;
}

export function getSyncQueueCount(): number {
  ensureSyncQueueTable();
  const row = db.prepare('SELECT COUNT(*) as c FROM _sync_queue WHERE attempts < 5').get() as { c: number };
  return row.c;
}
