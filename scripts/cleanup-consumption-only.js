/**
 * Production Cleanup Script - Consumption Records Only
 *
 * This script ONLY clears inventory consumption records (historical COGS data).
 * It does NOT delete any products.
 *
 * Safe for production rollout with fresh COGS tracking.
 */

const Database = require('better-sqlite3');
const db = new Database('./prisma/dev.db');

console.log('🧹 Production Cleanup Script - Consumption Records Only\n');
console.log('⚠️  WARNING: This will delete historical COGS data!\n');

// Clear InventoryConsumption table only
console.log('Clearing inventory consumption records...');
const consumptionResult = db.prepare('DELETE FROM InventoryConsumption').run();
console.log(`✅ Deleted ${consumptionResult.changes} consumption records\n`);

// Summary
console.log('📊 Cleanup Summary:');
const stats = {
  consumptions: db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption').get().count,
  products: db.prepare('SELECT COUNT(*) as count FROM Product').get().count,
  recipes: db.prepare('SELECT COUNT(*) as count FROM ProductRecipe').get().count,
};

console.log(`  - Consumption records: ${stats.consumptions}`);
console.log(`  - Products: ${stats.products} (unchanged)`);
console.log(`  - Recipe items: ${stats.recipes} (unchanged)`);
console.log('\n✅ Cleanup complete! All products preserved.\n');

db.close();
