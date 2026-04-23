/**
 * Diagnostic script: run with `node scripts/diagnose-orders.js 18 24 25`
 * Shows order details, items, variations (including bundle selection data), and consumption records.
 */
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(process.cwd(), 'prisma', 'dev.db'));

const orderNumbers = process.argv.slice(2);
if (orderNumbers.length === 0) {
  console.log('Usage: node scripts/diagnose-orders.js <orderNumber> [orderNumber...]');
  process.exit(1);
}

const placeholders = orderNumbers.map(() => '?').join(', ');
const orders = db.prepare(
  'SELECT * FROM "Order" WHERE orderNumber IN (' + placeholders + ') ORDER BY CAST(orderNumber AS INTEGER)'
).all(...orderNumbers);

if (orders.length === 0) {
  console.log('No orders found for numbers:', orderNumbers.join(', '));
  process.exit(0);
}

for (const o of orders) {
  console.log('\n' + '='.repeat(80));
  console.log('ORDER #' + o.orderNumber + ' (' + o.id + ')');
  console.log('  Status: ' + o.status + ' | Created: ' + o.createdAt);
  console.log('  Revenue: RM ' + o.total + ' | COGS: RM ' + o.totalCost + ' | Profit: RM ' + o.totalProfit + ' | Margin: ' + (o.overallMargin != null ? Number(o.overallMargin).toFixed(1) : 'null') + '%');

  const items = db.prepare('SELECT * FROM OrderItem WHERE orderId = ?').all(o.id);
  console.log('\n  LINE ITEMS (' + items.length + '):');

  for (const item of items) {
    console.log('    ' + item.productName + ' x' + item.quantity);
    console.log('      productId: ' + item.productId);
    console.log('      unitPrice: RM ' + item.unitPrice + ' | unitCost: RM ' + item.unitCost + ' | totalCost: RM ' + item.totalCost);

    if (item.variations) {
      try {
        var v = JSON.parse(item.variations);
        console.log('      isBundle: ' + (v._is_bundle || 'false'));
        console.log('      has _bundle_mandatory: ' + (v._bundle_mandatory ? 'YES' : 'NO'));
        console.log('      has _bundle_optional: ' + (v._bundle_optional ? 'YES' : 'NO'));
        if (v._bundle_mandatory) {
          try {
            var mand = JSON.parse(v._bundle_mandatory);
            console.log('      mandatory selections:');
            Object.entries(mand).forEach(function(entry) {
              console.log('        ' + entry[0] + ' => ' + entry[1]);
            });
          } catch (e) {
            console.log('      mandatory (raw): ' + v._bundle_mandatory);
          }
        }
        if (v._bundle_optional) {
          try {
            var opt = JSON.parse(v._bundle_optional);
            console.log('      optional selections: ' + JSON.stringify(opt));
          } catch (e) {
            console.log('      optional (raw): ' + v._bundle_optional);
          }
        }
      } catch (e) {
        console.log('      variations (parse error): ' + item.variations);
      }
    }
  }

  var consumptions = db.prepare('SELECT * FROM InventoryConsumption WHERE orderId = ?').all(o.id);
  console.log('\n  CONSUMPTION RECORDS (' + consumptions.length + '):');
  var totalFromConsumptions = 0;
  consumptions.forEach(function(c) {
    var label = c.materialName || c.linkedProductName || 'unknown';
    console.log('    ' + label + ' (' + c.itemType + ') qty:' + c.quantityConsumed + ' cost:RM ' + c.totalCost);
    totalFromConsumptions += c.totalCost;
  });
  console.log('  Total COGS from consumptions: RM ' + totalFromConsumptions.toFixed(2));

  if (Math.abs(totalFromConsumptions - o.totalCost) > 0.01) {
    console.log('  *** MISMATCH: Order.totalCost (RM ' + o.totalCost + ') != sum of consumptions (RM ' + totalFromConsumptions.toFixed(2) + ')');
  }
}

console.log('\n' + '='.repeat(80));
console.log('DONE');
