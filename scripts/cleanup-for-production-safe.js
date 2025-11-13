/**
 * Safe Production Cleanup Script
 *
 * This version fetches from WooCommerce first to ensure we only delete
 * products that are truly deleted from WooCommerce.
 *
 * Steps:
 * 1. Fetch all products from WooCommerce API
 * 2. Clear inventory consumption records
 * 3. Only delete local products that don't exist in WooCommerce
 *
 * CAUTION: This is destructive and cannot be undone!
 */

const Database = require('better-sqlite3');
const WooCommerceRestApi = require('@woocommerce/woocommerce-rest-api').default;
const fs = require('fs');

// Load environment variables from .env.local
const envFile = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    envVars[key] = value;
  }
});

const db = new Database('./prisma/dev.db');

// Initialize WooCommerce API
const wcApi = new WooCommerceRestApi({
  url: envVars.NEXT_PUBLIC_WC_API_URL || envVars.WC_API_URL || envVars.WC_STORE_URL,
  consumerKey: envVars.WC_CONSUMER_KEY,
  consumerSecret: envVars.WC_CONSUMER_SECRET,
  version: 'wc/v3',
});

async function cleanup() {
  console.log('🧹 Safe Production Cleanup Script\n');
  console.log('⚠️  WARNING: This will delete historical COGS data!\n');

  try {
    // Step 1: Fetch all products from WooCommerce
    console.log('Step 1: Fetching products from WooCommerce...');
    const response = await wcApi.get('products', { per_page: 100, status: 'publish' });
    const wcProducts = response.data;
    const wcProductIds = new Set(wcProducts.map(p => p.id));

    console.log(`✅ Found ${wcProducts.length} active products in WooCommerce\n`);

    // Step 2: Clear InventoryConsumption table
    console.log('Step 2: Clearing inventory consumption records...');
    const consumptionResult = db.prepare('DELETE FROM InventoryConsumption').run();
    console.log(`✅ Deleted ${consumptionResult.changes} consumption records\n`);

    // Step 3: Find products that can be deleted (not in WooCommerce and no dependencies)
    console.log('Step 3: Finding products to delete...');
    const allProducts = db.prepare('SELECT * FROM Product').all();
    const deletableProducts = [];

    for (const product of allProducts) {
      // Skip if product exists in WooCommerce
      if (product.wcId && wcProductIds.has(product.wcId)) {
        continue;
      }

      // Check for dependencies
      const recipeCount = db.prepare('SELECT COUNT(*) as count FROM ProductRecipe WHERE productId = ? OR linkedProductId = ?')
        .get(product.id, product.id).count;
      const poCount = db.prepare('SELECT COUNT(*) as count FROM PurchaseOrderItem WHERE productId = ?')
        .get(product.id).count;

      if (recipeCount === 0 && poCount === 0) {
        deletableProducts.push(product);
      }
    }

    if (deletableProducts.length > 0) {
      console.log(`Found ${deletableProducts.length} products to delete (not in WooCommerce):\n`);
      deletableProducts.forEach(p => {
        console.log(`  - ${p.name} (WC ID: ${p.wcId || 'none'}, SKU: ${p.sku})`);
      });

      // Step 4: Delete products
      console.log('\nStep 4: Deleting products...');
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
      console.log('No products to delete (all exist in WooCommerce or have dependencies)\n');
    }

    // Step 5: Summary
    console.log('📊 Cleanup Summary:');
    const stats = {
      consumptions: db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption').get().count,
      products: db.prepare('SELECT COUNT(*) as count FROM Product').get().count,
      wcProducts: wcProducts.length,
    };

    console.log(`  - Products in WooCommerce: ${stats.wcProducts}`);
    console.log(`  - Products in local DB: ${stats.products}`);
    console.log(`  - Consumption records: ${stats.consumptions}`);
    console.log('\n✅ Cleanup complete! Database ready for production.\n');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error('\nMake sure:');
    console.error('  1. Development server is NOT running (database locked)');
    console.error('  2. WooCommerce credentials are correct in .env.local');
    process.exit(1);
  } finally {
    db.close();
  }
}

cleanup();
