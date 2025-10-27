/**
 * Recipe System Test
 * Demonstrates the linked-list COGS system with ingredients and materials
 */

import { upsertProduct, getProduct } from './productService';
import { upsertMaterial, updateMaterialPrice, getMaterial } from './materialService';
import { addRecipeItem, getRecipeWithMaterials, recalculateRecipeCostsForMaterial } from './recipeService';

console.log('🧪 Testing Recipe-Based COGS System\n');

// Step 1: Create materials (ingredients and packaging)
console.log('1️⃣  Creating materials...\n');

const coffeeBeans = upsertMaterial({
  name: 'Coffee Beans (Arabica)',
  category: 'ingredient',
  purchaseUnit: 'g',
  purchaseQuantity: 500,  // 500g bag
  purchaseCost: 75.00,    // RM 75 per 500g bag
  stockQuantity: 2000,    // 2kg in stock
  lowStockThreshold: 500,
  supplier: 'Bean Suppliers Sdn Bhd',
});

console.log(`   ✅ ${coffeeBeans.name}`);
console.log(`      Purchase: ${coffeeBeans.purchaseQuantity}${coffeeBeans.purchaseUnit} @ RM ${coffeeBeans.purchaseCost.toFixed(2)}`);
console.log(`      Cost per unit: RM ${coffeeBeans.costPerUnit.toFixed(4)} per ${coffeeBeans.purchaseUnit}\n`);

const milk = upsertMaterial({
  name: 'Fresh Milk',
  category: 'ingredient',
  purchaseUnit: 'ml',
  purchaseQuantity: 1000,  // 1 litre
  purchaseCost: 6.50,      // RM 6.50 per litre
  stockQuantity: 5000,     // 5 litres
  lowStockThreshold: 1000,
  supplier: 'Dairy Suppliers',
});

console.log(`   ✅ ${milk.name}`);
console.log(`      Purchase: ${milk.purchaseQuantity}${milk.purchaseUnit} @ RM ${milk.purchaseCost.toFixed(2)}`);
console.log(`      Cost per unit: RM ${milk.costPerUnit.toFixed(4)} per ${milk.purchaseUnit}\n`);

const vanillaSyrup = upsertMaterial({
  name: 'Vanilla Syrup',
  category: 'ingredient',
  purchaseUnit: 'ml',
  purchaseQuantity: 750,   // 750ml bottle
  purchaseCost: 15.00,     // RM 15 per bottle
  stockQuantity: 2250,     // 3 bottles
  lowStockThreshold: 750,
  supplier: 'Syrup Co',
});

console.log(`   ✅ ${vanillaSyrup.name}`);
console.log(`      Purchase: ${vanillaSyrup.purchaseQuantity}${vanillaSyrup.purchaseUnit} @ RM ${vanillaSyrup.purchaseCost.toFixed(2)}`);
console.log(`      Cost per unit: RM ${vanillaSyrup.costPerUnit.toFixed(4)} per ${vanillaSyrup.purchaseUnit}\n`);

const cup12oz = upsertMaterial({
  name: '12oz Takeaway Cup',
  category: 'packaging',
  purchaseUnit: 'unit',
  purchaseQuantity: 100,   // 100 cups per pack
  purchaseCost: 50.00,     // RM 50 per pack
  stockQuantity: 500,
  lowStockThreshold: 100,
  supplier: 'Packaging Supplies',
});

console.log(`   ✅ ${cup12oz.name}`);
console.log(`      Purchase: ${cup12oz.purchaseQuantity} ${cup12oz.purchaseUnit}s @ RM ${cup12oz.purchaseCost.toFixed(2)}`);
console.log(`      Cost per unit: RM ${cup12oz.costPerUnit.toFixed(4)} per cup\n`);

const lid12oz = upsertMaterial({
  name: '12oz Cup Lid',
  category: 'packaging',
  purchaseUnit: 'unit',
  purchaseQuantity: 100,
  purchaseCost: 30.00,
  stockQuantity: 500,
  lowStockThreshold: 100,
  supplier: 'Packaging Supplies',
});

console.log(`   ✅ ${lid12oz.name}`);
console.log(`      Purchase: ${lid12oz.purchaseQuantity} ${lid12oz.purchaseUnit}s @ RM ${lid12oz.purchaseCost.toFixed(2)}`);
console.log(`      Cost per unit: RM ${lid12oz.costPerUnit.toFixed(4)} per lid\n`);

const takeawayBag = upsertMaterial({
  name: 'Takeaway Bag',
  category: 'packaging',
  purchaseUnit: 'unit',
  purchaseQuantity: 200,
  purchaseCost: 40.00,
  stockQuantity: 1000,
  lowStockThreshold: 200,
  supplier: 'Packaging Supplies',
});

console.log(`   ✅ ${takeawayBag.name}`);
console.log(`      Purchase: ${takeawayBag.purchaseQuantity} ${takeawayBag.purchaseUnit}s @ RM ${takeawayBag.purchaseCost.toFixed(2)}`);
console.log(`      Cost per unit: RM ${takeawayBag.costPerUnit.toFixed(4)} per bag\n`);

// Step 2: Create product (Latte)
console.log('\n2️⃣  Creating product (Latte)...\n');

const latte = upsertProduct({
  name: 'Latte',
  category: 'beverage',
  sku: 'LAT-001',
  basePrice: 12.00,
  currentPrice: 12.00,
  stockQuantity: 0,  // Made to order
  lowStockThreshold: 0,
  unit: 'unit',
  unitCost: 0,  // Will be calculated from recipe
  isActive: true,
});

console.log(`   ✅ Created: ${latte.name} (${latte.sku})`);
console.log(`      Selling Price: RM ${latte.currentPrice.toFixed(2)}\n`);

// Step 3: Add recipe items (linked list of ingredients/materials)
console.log('3️⃣  Building recipe (ingredient linked list)...\n');

console.log('   Adding required ingredients:');

addRecipeItem({
  productId: latte.id,
  materialId: coffeeBeans.id,
  quantity: 12,  // 12g of coffee beans
  unit: 'g',
  isOptional: false,
  sortOrder: 1,
});
console.log(`      1. Coffee Beans: 12g × RM ${coffeeBeans.costPerUnit.toFixed(4)} = RM ${(12 * coffeeBeans.costPerUnit).toFixed(2)}`);

addRecipeItem({
  productId: latte.id,
  materialId: milk.id,
  quantity: 250,  // 250ml of milk
  unit: 'ml',
  isOptional: false,
  sortOrder: 2,
});
console.log(`      2. Milk: 250ml × RM ${milk.costPerUnit.toFixed(4)} = RM ${(250 * milk.costPerUnit).toFixed(2)}`);

addRecipeItem({
  productId: latte.id,
  materialId: cup12oz.id,
  quantity: 1,  // 1 cup
  unit: 'unit',
  isOptional: false,
  sortOrder: 3,
});
console.log(`      3. Cup: 1 × RM ${cup12oz.costPerUnit.toFixed(2)} = RM ${cup12oz.costPerUnit.toFixed(2)}`);

addRecipeItem({
  productId: latte.id,
  materialId: lid12oz.id,
  quantity: 1,  // 1 lid
  unit: 'unit',
  isOptional: false,
  sortOrder: 4,
});
console.log(`      4. Lid: 1 × RM ${lid12oz.costPerUnit.toFixed(2)} = RM ${lid12oz.costPerUnit.toFixed(2)}\n`);

console.log('   Adding optional items:');

addRecipeItem({
  productId: latte.id,
  materialId: vanillaSyrup.id,
  quantity: 30,  // 30ml of syrup (optional)
  unit: 'ml',
  isOptional: true,
  sortOrder: 5,
});
console.log(`      5. Vanilla Syrup (optional): 30ml × RM ${vanillaSyrup.costPerUnit.toFixed(4)} = RM ${(30 * vanillaSyrup.costPerUnit).toFixed(2)}`);

addRecipeItem({
  productId: latte.id,
  materialId: takeawayBag.id,
  quantity: 1,  // 1 bag (optional)
  unit: 'unit',
  isOptional: true,
  sortOrder: 6,
});
console.log(`      6. Takeaway Bag (optional): 1 × RM ${takeawayBag.costPerUnit.toFixed(2)} = RM ${takeawayBag.costPerUnit.toFixed(2)}\n`);

// Step 4: Show calculated costs
console.log('4️⃣  Calculated Costs:\n');

const recipe = getRecipeWithMaterials(latte.id)!;
const updatedLatte = getProduct(latte.id)!;

console.log(`   Product: ${recipe.productName}`);
console.log(`   Selling Price: RM ${updatedLatte.currentPrice.toFixed(2)}\n`);

console.log(`   Required COGS: RM ${recipe.totalCost.toFixed(2)}`);
console.log(`   Optional Add-ons: RM ${recipe.totalOptionalCost.toFixed(2)}`);
console.log(`   Total if all included: RM ${(recipe.totalCost + recipe.totalOptionalCost).toFixed(2)}\n`);

const baseProfit = updatedLatte.currentPrice - recipe.totalCost;
const baseMargin = (baseProfit / updatedLatte.currentPrice) * 100;

const fullProfit = updatedLatte.currentPrice - (recipe.totalCost + recipe.totalOptionalCost);
const fullMargin = (fullProfit / updatedLatte.currentPrice) * 100;

console.log(`   Base Profit: RM ${baseProfit.toFixed(2)} (${baseMargin.toFixed(1)}% margin)`);
console.log(`   With add-ons: RM ${fullProfit.toFixed(2)} (${fullMargin.toFixed(1)}% margin)\n`);

// Step 5: Demonstrate price change propagation
console.log('5️⃣  Testing price change propagation...\n');

console.log(`   Current coffee beans cost: RM ${coffeeBeans.costPerUnit.toFixed(4)}/g`);
console.log(`   Current Latte COGS: RM ${updatedLatte.unitCost.toFixed(2)}\n`);

console.log('   Updating coffee beans price (500g bag now RM 85)...');

updateMaterialPrice(coffeeBeans.id, 500, 85.00, 'Price increase from supplier');

// Recalculate all recipes using this material
recalculateRecipeCostsForMaterial(coffeeBeans.id);

const newRecipe = getRecipeWithMaterials(latte.id)!;
const newLatte = getProduct(latte.id)!;
const updatedBeans = getMaterial(coffeeBeans.id)!;

console.log(`   New coffee beans cost: RM ${updatedBeans.costPerUnit.toFixed(4)}/g`);
console.log(`   New Latte COGS: RM ${newLatte.unitCost.toFixed(2)}`);
console.log(`   Change: +RM ${(newLatte.unitCost - updatedLatte.unitCost).toFixed(2)}\n`);

const newProfit = newLatte.currentPrice - newRecipe.totalCost;
const newMargin = (newProfit / newLatte.currentPrice) * 100;

console.log(`   New profit: RM ${newProfit.toFixed(2)} (${newMargin.toFixed(1)}% margin)\n`);

// Step 6: Show recipe breakdown
console.log('6️⃣  Complete Recipe Breakdown:\n');

recipe.items.forEach((item, idx) => {
  const optional = item.isOptional ? ' (optional)' : '';
  console.log(`   ${idx + 1}. ${item.materialName}${optional}`);
  console.log(`      Quantity: ${item.quantity}${item.unit}`);
  console.log(`      Cost: RM ${item.calculatedCost.toFixed(4)}`);
  console.log(`      Category: ${item.materialCategory}\n`);
});

console.log('✅ Recipe system test complete!\n');

console.log('📋 Summary:');
console.log(`   - Materials track purchase price and calculate cost per unit`);
console.log(`   - Products have a recipe (linked list of materials with quantities)`);
console.log(`   - Product COGS is auto-calculated from recipe`);
console.log(`   - When material prices change, all product costs update automatically`);
console.log(`   - Supports optional items (syrup, bag, etc.)`);
