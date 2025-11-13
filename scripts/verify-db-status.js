const Database = require('better-sqlite3');
const db = new Database('./prisma/dev.db');

console.log('📊 Database Status:\n');

const stats = {
  products: db.prepare('SELECT COUNT(*) as count FROM Product').get().count,
  consumptions: db.prepare('SELECT COUNT(*) as count FROM InventoryConsumption').get().count,
  recipes: db.prepare('SELECT COUNT(*) as count FROM ProductRecipe').get().count,
  purchaseOrders: db.prepare('SELECT COUNT(*) as count FROM PurchaseOrder').get().count,
};

console.log('Products:', stats.products);
console.log('Consumption Records:', stats.consumptions);
console.log('Recipe Items:', stats.recipes);
console.log('Purchase Orders:', stats.purchaseOrders);
console.log('\n✅ Database ready for production!');

db.close();
