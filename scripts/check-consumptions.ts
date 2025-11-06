// Diagnostic script to check consumption records in database
import Database from 'better-sqlite3';

const db = new Database('dev.db');

console.log('=== DATABASE DIAGNOSTIC ===\n');

// Check total consumption records
const totalCount = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption').get() as { count: number };
console.log(`Total consumption records in database: ${totalCount.count}\n`);

if (totalCount.count > 0) {
  // Show all unique orderIds
  const uniqueOrders = db.prepare(`
    SELECT DISTINCT orderId, typeof(orderId) as type, COUNT(*) as count
    FROM InventoryConsumption
    GROUP BY orderId
    ORDER BY orderId DESC
    LIMIT 20
  `).all();

  console.log('Unique orderIds in database:');
  uniqueOrders.forEach((row: any) => {
    console.log(`  orderId=${row.orderId} (type: ${row.type}), records: ${row.count}`);
  });

  console.log('\n=== Testing specific queries ===');

  // Test different query methods for order 389
  const test389_string = db.prepare("SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = '389'").get() as { count: number };
  const test389_number = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = 389').get() as { count: number };
  const test389_param = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = ?').get('389') as { count: number };

  console.log(`Order 389:`);
  console.log(`  Query with '389' hardcoded: ${test389_string.count} records`);
  console.log(`  Query with 389 hardcoded: ${test389_number.count} records`);
  console.log(`  Query with ? param ('389'): ${test389_param.count} records`);

  // Test for order 390
  const test390_string = db.prepare("SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = '390'").get() as { count: number };
  const test390_number = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = 390').get() as { count: number };
  const test390_param = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = ?').get('390') as { count: number };

  console.log(`\nOrder 390:`);
  console.log(`  Query with '390' hardcoded: ${test390_string.count} records`);
  console.log(`  Query with 390 hardcoded: ${test390_number.count} records`);
  console.log(`  Query with ? param ('390'): ${test390_param.count} records`);

  // Show sample records
  console.log('\n=== Sample consumption records ===');
  const samples = db.prepare('SELECT orderId, orderItemId, productName, totalCost FROM InventoryConsumption ORDER BY consumedAt DESC LIMIT 10').all();
  samples.forEach((rec: any) => {
    console.log(`  Order ${rec.orderId}, Item ${rec.orderItemId}, ${rec.productName}, RM ${rec.totalCost}`);
  });
}

db.close();
console.log('\n=== END DIAGNOSTIC ===');
