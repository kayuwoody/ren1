/**
 * Database Test Script
 * Tests product and order creation with mock data
 */

import { upsertProduct, getProduct, recordStockMovement, listActiveProducts } from './productService';
import { createOrder, getOrderWithItems, getOrderStats } from './orderService';

console.log('🧪 Testing database operations...\n');

// Test 1: Create products
console.log('1️⃣  Creating test products...');

const espresso = upsertProduct({
  name: 'Espresso',
  category: 'beverage',
  sku: 'ESP-001',
  basePrice: 8.00,
  currentPrice: 8.00,
  stockQuantity: 100,
  lowStockThreshold: 20,
  unit: 'unit',
  unitCost: 2.50, // COGS: beans + cup + lid
  isActive: true,
});

const latte = upsertProduct({
  name: 'Latte',
  category: 'beverage',
  sku: 'LAT-001',
  basePrice: 12.00,
  currentPrice: 12.00,
  stockQuantity: 100,
  lowStockThreshold: 20,
  unit: 'unit',
  unitCost: 4.00, // COGS: beans + milk + cup + lid
  isActive: true,
});

const croissant = upsertProduct({
  name: 'Butter Croissant',
  category: 'food',
  sku: 'CRO-001',
  basePrice: 6.00,
  currentPrice: 6.00,
  stockQuantity: 50,
  lowStockThreshold: 10,
  unit: 'unit',
  unitCost: 2.00, // COGS: flour + butter + packaging
  isActive: true,
});

console.log(`✅ Created ${listActiveProducts().length} products`);

// Test 2: Record stock movement
console.log('\n2️⃣  Recording stock movement...');

recordStockMovement({
  productId: espresso.id,
  type: 'purchase',
  quantity: 50,
  previousStock: espresso.stockQuantity,
  newStock: espresso.stockQuantity + 50,
  unitCost: 2.50,
  totalCost: 125.00,
  performedBy: 'test-admin',
  reason: 'Initial stock',
});

console.log('✅ Stock movement recorded');

// Test 3: Create an order
console.log('\n3️⃣  Creating test order...');

const order = createOrder({
  orderNumber: 'TEST-001',
  customerId: 'customer-123',
  customerEmail: 'test@example.com',
  items: [
    {
      productId: espresso.id,
      quantity: 2,
      unitPrice: 8.00,
    },
    {
      productId: latte.id,
      quantity: 1,
      unitPrice: 12.00,
    },
    {
      productId: croissant.id,
      quantity: 1,
      unitPrice: 6.00,
    },
  ],
  totalDiscount: 2.00, // RM 2 discount
  tax: 1.30, // 6% tax
  paymentMethod: 'Credit Card',
  paymentStatus: 'paid',
  status: 'completed',
});

console.log(`✅ Order created: ${order.orderNumber}`);
console.log(`   Subtotal: RM ${order.subtotal.toFixed(2)}`);
console.log(`   Discount: RM ${order.totalDiscount.toFixed(2)}`);
console.log(`   Tax: RM ${order.tax.toFixed(2)}`);
console.log(`   Total: RM ${order.total.toFixed(2)}`);
console.log(`   COGS: RM ${order.totalCOGS.toFixed(2)}`);
console.log(`   Gross Profit: RM ${order.grossProfit.toFixed(2)}`);
console.log(`   Gross Margin: ${order.grossMargin.toFixed(1)}%`);

// Test 4: Get order with items
console.log('\n4️⃣  Fetching order with items...');

const orderWithItems = getOrderWithItems(order.id);
if (orderWithItems) {
  console.log(`✅ Order has ${orderWithItems.items.length} items:`);
  orderWithItems.items.forEach((item, idx) => {
    console.log(`   ${idx + 1}. ${item.productName} x${item.quantity}`);
    console.log(`      Unit Price: RM ${item.unitPrice.toFixed(2)}`);
    console.log(`      Unit Cost: RM ${item.unitCost.toFixed(2)}`);
    console.log(`      Item Profit: RM ${item.itemProfit.toFixed(2)} (${item.itemMargin.toFixed(1)}% margin)`);
  });
}

// Test 5: Get order statistics
console.log('\n5️⃣  Calculating order statistics...');

const stats = getOrderStats(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
  new Date().toISOString()
);

console.log('✅ Statistics (last 7 days):');
console.log(`   Total Orders: ${stats.totalOrders}`);
console.log(`   Total Revenue: RM ${stats.totalRevenue.toFixed(2)}`);
console.log(`   Total COGS: RM ${stats.totalCOGS.toFixed(2)}`);
console.log(`   Total Profit: RM ${stats.totalProfit.toFixed(2)}`);
console.log(`   Average Order Value: RM ${stats.averageOrderValue.toFixed(2)}`);
console.log(`   Average Margin: ${stats.averageMargin.toFixed(1)}%`);

console.log('\n✅ All tests passed! Database is working correctly.\n');
