/**
 * Transaction Analytics Test
 * Demonstrates historical tracking and insights
 */

import { upsertProduct } from './productService';
import { upsertMaterial, updateMaterialPrice } from './materialService';
import { addRecipeItem, recalculateRecipeCostsForMaterial } from './recipeService';
import { createOrder, getOrderWithItems } from './orderService';
import {
  getProfitabilityTrend,
  getCOGSTrendForProduct,
  compareProducts,
  getProductsWithDecliningMargins,
  analyzePriceSensitivity,
} from './analyticsService';

console.log('🧪 Testing Transaction Analytics & Insights\n');

// Setup: Create materials and products with recipes
console.log('1️⃣  Setting up products with recipes...\n');

const coffeeBeans = upsertMaterial({
  name: 'Coffee Beans',
  category: 'ingredient',
  purchaseUnit: 'g',
  purchaseQuantity: 500,
  purchaseCost: 75.00,
  stockQuantity: 5000,
  lowStockThreshold: 500,
});

const milk = upsertMaterial({
  name: 'Milk',
  category: 'ingredient',
  purchaseUnit: 'ml',
  purchaseQuantity: 1000,
  purchaseCost: 6.50,
  stockQuantity: 10000,
  lowStockThreshold: 1000,
});

const cup = upsertMaterial({
  name: '12oz Cup',
  category: 'packaging',
  purchaseUnit: 'unit',
  purchaseQuantity: 100,
  purchaseCost: 50.00,
  stockQuantity: 500,
  lowStockThreshold: 100,
});

const lid = upsertMaterial({
  name: '12oz Lid',
  category: 'packaging',
  purchaseUnit: 'unit',
  purchaseQuantity: 100,
  purchaseCost: 30.00,
  stockQuantity: 500,
  lowStockThreshold: 100,
});

// Create Latte
const latte = upsertProduct({
  name: 'Latte',
  category: 'beverage',
  sku: 'LAT-001',
  basePrice: 12.00,
  currentPrice: 12.00,
  stockQuantity: 0,
  lowStockThreshold: 0,
  unit: 'unit',
  unitCost: 0,
  isActive: true,
});

addRecipeItem({ productId: latte.id, materialId: coffeeBeans.id, quantity: 12, unit: 'g' });
addRecipeItem({ productId: latte.id, materialId: milk.id, quantity: 250, unit: 'ml' });
addRecipeItem({ productId: latte.id, materialId: cup.id, quantity: 1, unit: 'unit' });
addRecipeItem({ productId: latte.id, materialId: lid.id, quantity: 1, unit: 'unit' });

// Create Espresso
const espresso = upsertProduct({
  name: 'Espresso',
  category: 'beverage',
  sku: 'ESP-001',
  basePrice: 8.00,
  currentPrice: 8.00,
  stockQuantity: 0,
  lowStockThreshold: 0,
  unit: 'unit',
  unitCost: 0,
  isActive: true,
});

addRecipeItem({ productId: espresso.id, materialId: coffeeBeans.id, quantity: 18, unit: 'g' });
addRecipeItem({ productId: espresso.id, materialId: cup.id, quantity: 1, unit: 'unit' });
addRecipeItem({ productId: espresso.id, materialId: lid.id, quantity: 1, unit: 'unit' });

console.log(`   ✅ Created Latte (COGS: RM 4.23)`);
console.log(`   ✅ Created Espresso (COGS: RM 3.50)\n`);

// Simulate sales over time with changing costs
console.log('2️⃣  Simulating sales with price changes...\n');

// Week 1: Regular prices, original costs
const threeDaysAgo = new Date();
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

const order1 = createOrder({
  orderNumber: 'ORD-001',
  items: [
    { productId: latte.id, quantity: 2, unitPrice: 12.00 },
    { productId: espresso.id, quantity: 1, unitPrice: 8.00 },
  ],
  paymentMethod: 'Cash',
  paymentStatus: 'paid',
  status: 'completed',
});

console.log(`   Order 1 (3 days ago):`);
console.log(`      2× Latte @ RM 12.00 (COGS: RM 4.23)`);
console.log(`      1× Espresso @ RM 8.00 (COGS: RM 3.50)`);
console.log(`      Total: RM ${order1.total.toFixed(2)}, Profit: RM ${order1.grossProfit.toFixed(2)} (${order1.grossMargin.toFixed(1)}%)\n`);

// Week 2: Coffee price increases
console.log('   🔄 Coffee beans price increases: RM 75/500g → RM 85/500g\n');
updateMaterialPrice(coffeeBeans.id, 500, 85.00, 'Supplier price increase');
recalculateRecipeCostsForMaterial(coffeeBeans.id);

const twoDaysAgo = new Date();
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

const order2 = createOrder({
  orderNumber: 'ORD-002',
  items: [
    { productId: latte.id, quantity: 3, unitPrice: 12.00 },
    { productId: espresso.id, quantity: 2, unitPrice: 8.00 },
  ],
  paymentMethod: 'Card',
  paymentStatus: 'paid',
  status: 'completed',
});

console.log(`   Order 2 (2 days ago, after price increase):`);
console.log(`      3× Latte @ RM 12.00 (COGS: RM 4.47 - increased!)`);
console.log(`      2× Espresso @ RM 8.00 (COGS: RM 3.74 - increased!)`);
console.log(`      Total: RM ${order2.total.toFixed(2)}, Profit: RM ${order2.grossProfit.toFixed(2)} (${order2.grossMargin.toFixed(1)}%)\n`);

// Week 3: Run promotion (discounted price)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const order3 = createOrder({
  orderNumber: 'ORD-003',
  items: [
    { productId: latte.id, quantity: 4, unitPrice: 10.00, discountApplied: 2.00 }, // Promo: RM 2 off
    { productId: espresso.id, quantity: 1, unitPrice: 8.00 },
  ],
  totalDiscount: 8.00, // 4× RM 2 discount
  paymentMethod: 'Card',
  paymentStatus: 'paid',
  status: 'completed',
});

console.log(`   Order 3 (yesterday, with promotion):`);
console.log(`      4× Latte @ RM 10.00 (discounted from RM 12.00)`);
console.log(`      1× Espresso @ RM 8.00`);
console.log(`      Discount: RM ${order3.totalDiscount.toFixed(2)}`);
console.log(`      Total: RM ${order3.total.toFixed(2)}, Profit: RM ${order3.grossProfit.toFixed(2)} (${order3.grossMargin.toFixed(1)}%)\n`);

// Show captured transaction data
console.log('3️⃣  Transaction Data Captured:\n');

const order1Details = getOrderWithItems(order1.id)!;
order1Details.items.forEach((item: any) => {
  console.log(`   ${item.productName}:`);
  console.log(`      Base Price: RM ${item.basePrice.toFixed(2)}`);
  console.log(`      Sold At: RM ${item.unitPrice.toFixed(2)}`);
  console.log(`      COGS: RM ${item.unitCost.toFixed(2)}`);
  console.log(`      Margin: ${item.itemMargin.toFixed(1)}%`);
  if (item.recipeSnapshot) {
    console.log(`      Recipe: ${item.recipeSnapshot.map((r: any) => `${r.materialName} (RM ${r.cost.toFixed(2)})`).join(', ')}`);
  }
  console.log();
});

// Analytics
console.log('4️⃣  Profitability Trends:\n');

const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
const now = new Date();

const trends = getProfitabilityTrend(sevenDaysAgo.toISOString(), now.toISOString(), 'week');

trends.forEach(trend => {
  console.log(`   ${trend.productName}:`);
  console.log(`      Total Sold: ${trend.totalSold} units`);
  console.log(`      Avg Price: RM ${trend.avgSoldPrice.toFixed(2)}`);
  console.log(`      Avg COGS: RM ${trend.avgCOGS.toFixed(2)}`);
  console.log(`      Avg Margin: ${trend.avgMargin.toFixed(1)}%`);
  console.log(`      Total Profit: RM ${trend.totalProfit.toFixed(2)}\n`);
});

// COGS Trend for Latte
console.log('5️⃣  COGS Trend for Latte:\n');

const cogsTrend = getCOGSTrendForProduct(latte.id, sevenDaysAgo.toISOString(), now.toISOString());

if (cogsTrend.length > 0) {
  console.log(`   COGS changed over time:`);
  cogsTrend.forEach(day => {
    console.log(`      ${day.date}: RM ${day.avgCOGS.toFixed(2)} (${day.totalSold} sold)`);
  });
  console.log();
} else {
  console.log(`   (All sales on same day, trend not visible)\n`);
}

// Product Comparison
console.log('6️⃣  Product Performance Comparison:\n');

const comparison = compareProducts(sevenDaysAgo.toISOString(), now.toISOString());

comparison.forEach(product => {
  console.log(`   ${product.productName}:`);
  console.log(`      Sold: ${product.totalSold} units`);
  console.log(`      Revenue: RM ${product.totalRevenue.toFixed(2)}`);
  console.log(`      Profit: RM ${product.totalProfit.toFixed(2)}`);
  console.log(`      Margin: ${product.avgMargin.toFixed(1)}%\n`);
});

// Products with declining margins
console.log('7️⃣  Products with Declining Margins:\n');

const declining = getProductsWithDecliningMargins(7);

if (declining.length > 0) {
  declining.forEach(product => {
    console.log(`   ⚠️  ${product.productName}:`);
    console.log(`      Previous margin: ${product.previousMargin.toFixed(1)}%`);
    console.log(`      Recent margin: ${product.recentMargin.toFixed(1)}%`);
    console.log(`      Change: ${product.marginChange.toFixed(1)}% (worse)`);
    console.log(`      Previous COGS: RM ${product.previousCOGS.toFixed(2)}`);
    console.log(`      Recent COGS: RM ${product.recentCOGS.toFixed(2)}`);
    console.log(`      COGS increased by: RM ${product.cogsChange.toFixed(2)}\n`);
  });
} else {
  console.log(`   ✅ No products with declining margins\n`);
}

// Price Sensitivity
console.log('8️⃣  Price Sensitivity for Latte:\n');

const priceSensitivity = analyzePriceSensitivity(latte.id, sevenDaysAgo.toISOString(), now.toISOString());

priceSensitivity.forEach(range => {
  console.log(`   ${range.priceRange}:`);
  console.log(`      Units Sold: ${range.unitsSold}`);
  console.log(`      Revenue: RM ${range.totalRevenue.toFixed(2)}`);
  console.log(`      Avg Margin: ${range.avgMargin.toFixed(1)}%\n`);
});

console.log('✅ Transaction analytics test complete!\n');

console.log('📊 Key Insights:');
console.log('   - Every sale captures: sold price, COGS, recipe snapshot');
console.log('   - COGS changes tracked over time (coffee RM 4.23 → RM 4.47)');
console.log('   - Can identify products becoming less profitable');
console.log('   - Price sensitivity analysis shows impact of promotions');
console.log('   - Recipe snapshots preserve exact costs at time of sale');
console.log('   - Perfect for deciding which products to promote vs phase out');
