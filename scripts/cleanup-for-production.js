/**
 * Production Cleanup Script
 *
 * Clears historical data for fresh production rollout:
 * - Clears all inventory consumption records (COGS history)
 * - Deletes products that no longer exist in WooCommerce (after removing dependencies)
 *
 * CAUTION: This is destructive and cannot be undone!
 */

const Database = require('better-sqlite3');
const db = new Database('./prisma/dev.db');

console.log('🧹 Production Cleanup Script\n');
console.log('⚠️  WARNING: This will delete historical COGS data!\n');

// Step 1: Clear InventoryConsumption table
console.log('Step 1: Clearing inventory consumption records...');
const consumptionResult = db.prepare('DELETE FROM InventoryConsumption').run();
console.log(`✅ Deleted ${consumptionResult.changes} consumption records\n`);

// Step 2: Find products that can now be deleted
console.log('Step 2: Finding deletable products...');
const allProducts = db.prepare('SELECT * FROM Product').all();
const deletableProducts = [];

for (const product of allProducts) {
  // Check for dependencies
  const recipeCount = db.prepare('SELECT COUNT(*) as count FROM ProductRecipe WHERE productId = ? OR linkedProductId = ?').get(product.id, product.id).count;
  const poCount = db.prepare('SELECT COUNT(*) as count FROM PurchaseOrderItem WHERE productId = ?').get(product.id).count;

  if (recipeCount === 0 && poCount === 0) {
    deletableProducts.push(product);
  }
}

console.log(`Found ${deletableProducts.length} products that can be deleted:\n`);
deletableProducts.forEach(p => {
  console.log(`  - ${p.name} (WC ID: ${p.wcId || 'none'}, SKU: ${p.sku})`);
});

// Step 3: Delete products without dependencies
if (deletableProducts.length > 0) {
  console.log('\nStep 3: Deleting products...');
  let deleted = 0;

  for (const product of deletableProducts) {
    try {
      db.prepare('DELETE FROM Product WHERE id = ?').run(product.id);
      deleted++;
    } catch (err) {
      console.log(`  ⚠️  Failed to delete ${product.name}: ${err.message}`);
    }
  }

  console.log(`✅ Deleted ${deleted}/${deletableProducts.length} products\n`);
} else {
  console.log('\nNo products to delete (all have dependencies)\n');
}

// Step 4: Summary
console.log('📊 Cleanup Summary:');
const remainingConsumptions = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption').get().count;
const remainingProducts = db.prepare('SELECT COUNT(*) as count FROM Product').get().count;

console.log(`  - Consumption records: ${remainingConsumptions}`);
console.log(`  - Products: ${remainingProducts}`);
console.log('\n✅ Cleanup complete! Database ready for production.\n');

db.close();
