/**
 * Database Initialization Script
 * Creates all tables for cost tracking, inventory, and profit analytics
 */

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/**
 * Initialize database schema
 */
export function initializeDatabase() {
  console.log('🗄️  Initializing database...');

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Product (
      id TEXT PRIMARY KEY,
      woocommerceId INTEGER UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      basePrice REAL NOT NULL,
      currentPrice REAL NOT NULL,
      stockQuantity REAL NOT NULL DEFAULT 0,
      lowStockThreshold REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL,
      unitCost REAL NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_product_woocommerce ON Product(woocommerceId);
    CREATE INDEX IF NOT EXISTS idx_product_sku ON Product(sku);
    CREATE INDEX IF NOT EXISTS idx_product_category ON Product(category);
    CREATE INDEX IF NOT EXISTS idx_product_active ON Product(isActive);
  `);

  // Stock movements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS StockMovement (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      previousStock REAL NOT NULL,
      newStock REAL NOT NULL,
      unitCost REAL,
      totalCost REAL,
      orderId TEXT,
      purchaseOrderId TEXT,
      reason TEXT,
      performedBy TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_product ON StockMovement(productId, timestamp);
    CREATE INDEX IF NOT EXISTS idx_stock_type ON StockMovement(type, timestamp);
  `);

  // Ingredient costs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS IngredientCost (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      name TEXT NOT NULL,
      ingredients TEXT NOT NULL,
      totalIngredientCost REAL NOT NULL,
      lastUpdated TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE INDEX IF NOT EXISTS idx_ingredient_product ON IngredientCost(productId);
  `);

  // Materials table (ingredients and packaging)
  db.exec(`
    CREATE TABLE IF NOT EXISTS Material (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      purchaseUnit TEXT NOT NULL,
      purchaseQuantity REAL NOT NULL,
      purchaseCost REAL NOT NULL,
      costPerUnit REAL NOT NULL,
      stockQuantity REAL NOT NULL DEFAULT 0,
      lowStockThreshold REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      lastPurchaseDate TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_material_category ON Material(category);
    CREATE INDEX IF NOT EXISTS idx_material_name ON Material(name);
  `);

  // Product Recipe (ingredients list for each product)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ProductRecipe (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      materialId TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      calculatedCost REAL NOT NULL,
      isOptional INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE,
      FOREIGN KEY (materialId) REFERENCES Material(id)
    );

    CREATE INDEX IF NOT EXISTS idx_recipe_product ON ProductRecipe(productId);
    CREATE INDEX IF NOT EXISTS idx_recipe_material ON ProductRecipe(materialId);
  `);

  // Material price history
  db.exec(`
    CREATE TABLE IF NOT EXISTS MaterialPriceHistory (
      id TEXT PRIMARY KEY,
      materialId TEXT NOT NULL,
      purchaseQuantity REAL NOT NULL,
      purchaseCost REAL NOT NULL,
      costPerUnit REAL NOT NULL,
      effectiveDate TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (materialId) REFERENCES Material(id)
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_material ON MaterialPriceHistory(materialId, effectiveDate);
  `);

  // Product cost breakdown table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ProductCostBreakdown (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      ingredientCosts TEXT NOT NULL,
      totalIngredientCost REAL NOT NULL,
      packagingCosts TEXT NOT NULL,
      totalPackagingCost REAL NOT NULL,
      consumables TEXT NOT NULL,
      totalConsumableCost REAL NOT NULL,
      totalCost REAL NOT NULL,
      sellingPrice REAL NOT NULL,
      grossProfit REAL NOT NULL,
      grossMargin REAL NOT NULL,
      calculatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cost_breakdown_product ON ProductCostBreakdown(productId);
  `);

  // Discounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Discount (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      minPurchaseAmount REAL,
      maxDiscount REAL,
      applicableProducts TEXT,
      applicableCategories TEXT,
      comboItems TEXT,
      comboPrice REAL,
      buyQuantity INTEGER,
      getQuantity INTEGER,
      getProductId TEXT,
      startDate TEXT NOT NULL,
      endDate TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      maxUsesTotal INTEGER,
      maxUsesPerCustomer INTEGER,
      currentUses INTEGER NOT NULL DEFAULT 0,
      priority INTEGER NOT NULL DEFAULT 0,
      stackable INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_discount_code ON Discount(code);
    CREATE INDEX IF NOT EXISTS idx_discount_active ON Discount(isActive, startDate, endDate);
  `);

  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Order" (
      id TEXT PRIMARY KEY,
      woocommerceId INTEGER UNIQUE,
      orderNumber TEXT NOT NULL UNIQUE,
      customerId TEXT,
      customerEmail TEXT,
      subtotal REAL NOT NULL,
      totalDiscount REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      totalCOGS REAL NOT NULL,
      grossProfit REAL NOT NULL,
      grossMargin REAL NOT NULL,
      paymentMethod TEXT NOT NULL,
      paymentStatus TEXT NOT NULL,
      status TEXT NOT NULL,
      lockerSlot TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      completedAt TEXT,
      cancelledAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_order_woocommerce ON "Order"(woocommerceId);
    CREATE INDEX IF NOT EXISTS idx_order_number ON "Order"(orderNumber);
    CREATE INDEX IF NOT EXISTS idx_order_status ON "Order"(status);
    CREATE INDEX IF NOT EXISTS idx_order_customer ON "Order"(customerId);
    CREATE INDEX IF NOT EXISTS idx_order_created ON "Order"(createdAt);
  `);

  // Order items table (transaction-level data capture)
  db.exec(`
    CREATE TABLE IF NOT EXISTS OrderItem (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      category TEXT NOT NULL,
      sku TEXT NOT NULL,
      quantity REAL NOT NULL,
      basePrice REAL NOT NULL,
      unitPrice REAL NOT NULL,
      subtotal REAL NOT NULL,
      unitCost REAL NOT NULL,
      totalCost REAL NOT NULL,
      itemProfit REAL NOT NULL,
      itemMargin REAL NOT NULL,
      recipeSnapshot TEXT,
      variations TEXT,
      discountApplied REAL DEFAULT 0,
      finalPrice REAL NOT NULL,
      soldAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (orderId) REFERENCES "Order"(id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );

    CREATE INDEX IF NOT EXISTS idx_orderitem_order ON OrderItem(orderId);
    CREATE INDEX IF NOT EXISTS idx_orderitem_product ON OrderItem(productId);
    CREATE INDEX IF NOT EXISTS idx_orderitem_category ON OrderItem(category);
    CREATE INDEX IF NOT EXISTS idx_orderitem_soldAt ON OrderItem(soldAt);
  `);

  // Applied discounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS AppliedDiscount (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      discountId TEXT NOT NULL,
      discountName TEXT NOT NULL,
      type TEXT NOT NULL,
      amountSaved REAL NOT NULL,
      appliedTo TEXT NOT NULL,
      productIds TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (orderId) REFERENCES "Order"(id) ON DELETE CASCADE,
      FOREIGN KEY (discountId) REFERENCES Discount(id)
    );

    CREATE INDEX IF NOT EXISTS idx_applieddiscount_order ON AppliedDiscount(orderId);
    CREATE INDEX IF NOT EXISTS idx_applieddiscount_discount ON AppliedDiscount(discountId);
  `);

  // Daily sales summary table
  db.exec(`
    CREATE TABLE IF NOT EXISTS DailySales (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      totalOrders INTEGER NOT NULL,
      totalRevenue REAL NOT NULL,
      averageOrderValue REAL NOT NULL,
      totalCOGS REAL NOT NULL,
      totalDiscounts REAL NOT NULL,
      grossProfit REAL NOT NULL,
      grossMargin REAL NOT NULL,
      productSales TEXT NOT NULL,
      categorySales TEXT NOT NULL,
      topProducts TEXT NOT NULL,
      wasteValue REAL DEFAULT 0,
      calculatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_daily_date ON DailySales(date);
  `);

  console.log('✅ Database schema created successfully');
}

// Run initialization if called directly
if (require.main === module) {
  try {
    initializeDatabase();
    db.close();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

export default db;
