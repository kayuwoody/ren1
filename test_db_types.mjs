// Quick test to see what types are in the database
import Database from '../node_modules/better-sqlite3/lib/index.js';

const db = new Database('dev.db', { verbose: console.log });

console.log('\n=== Checking orderItemId types in database ===\n');

// Check order 389
const order389 = db.prepare('SELECT orderId, orderItemId, typeof(orderItemId) as type, productName FROM InventoryConsumption WHERE orderId = ?').all('389');
console.log(`Order 389 (${order389.length} records):`);
order389.slice(0, 3).forEach(r => {
  console.log(`  orderItemId=${r.orderItemId} (${r.type}), product=${r.productName}`);
});

// Check order 390
const order390 = db.prepare('SELECT orderId, orderItemId, typeof(orderItemId) as type, productName FROM InventoryConsumption WHERE orderId = ?').all('390');
console.log(`\nOrder 390 (${order390.length} records):`);
order390.slice(0, 3).forEach(r => {
  console.log(`  orderItemId=${r.orderItemId} (${r.type}), product=${r.productName}`);
});

// Check with number comparison
console.log('\n=== Testing queries ===');
const test390String = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = ?').get('390');
const test390Number = db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption WHERE orderId = ?').get(390);
console.log(`Query with '390' (string): ${test390String.count} records`);
console.log(`Query with 390 (number): ${test390Number.count} records`);

db.close();
