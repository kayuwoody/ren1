import Database from 'better-sqlite3';
import path from 'path';

// Database file location
const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initDatabase() {
  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Product (
      id TEXT PRIMARY KEY,
      wcId INTEGER UNIQUE,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'uncategorized',
      basePrice REAL NOT NULL DEFAULT 0,
      unitCost REAL NOT NULL DEFAULT 0,
      stockQuantity REAL NOT NULL DEFAULT 0,
      imageUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
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
  `);

  // Product Recipe (ingredients list for each product)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ProductRecipe (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      itemType TEXT NOT NULL DEFAULT 'material',
      materialId TEXT,
      linkedProductId TEXT,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      calculatedCost REAL NOT NULL,
      isOptional INTEGER NOT NULL DEFAULT 0,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE,
      FOREIGN KEY (materialId) REFERENCES Material(id),
      FOREIGN KEY (linkedProductId) REFERENCES Product(id)
    );
  `);

  // Migration: Update existing ProductRecipe table to support product links
  // Check if we need to migrate (old schema has NOT NULL on materialId)
  try {
    // Try to get table info
    const tableInfo = db.prepare("PRAGMA table_info(ProductRecipe)").all() as any[];
    const hasItemType = tableInfo.some((col: any) => col.name === 'itemType');
    const materialIdColumn = tableInfo.find((col: any) => col.name === 'materialId');

    // If table exists but doesn't have new columns, or materialId is NOT NULL, migrate
    if (tableInfo.length > 0 && (!hasItemType || (materialIdColumn && materialIdColumn.notnull === 1))) {
      console.log('🔄 Migrating ProductRecipe table to support product links...');

      // Rename old table
      db.exec(`ALTER TABLE ProductRecipe RENAME TO ProductRecipe_old`);

      // Create new table with correct schema
      db.exec(`
        CREATE TABLE ProductRecipe (
          id TEXT PRIMARY KEY,
          productId TEXT NOT NULL,
          itemType TEXT NOT NULL DEFAULT 'material',
          materialId TEXT,
          linkedProductId TEXT,
          quantity REAL NOT NULL,
          unit TEXT NOT NULL,
          calculatedCost REAL NOT NULL,
          isOptional INTEGER NOT NULL DEFAULT 0,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE,
          FOREIGN KEY (materialId) REFERENCES Material(id),
          FOREIGN KEY (linkedProductId) REFERENCES Product(id)
        )
      `);

      // Copy data from old table
      db.exec(`
        INSERT INTO ProductRecipe (id, productId, itemType, materialId, linkedProductId, quantity, unit, calculatedCost, isOptional, sortOrder, createdAt)
        SELECT id, productId, 'material', materialId, NULL, quantity, unit, calculatedCost,
               COALESCE(isOptional, 0), COALESCE(sortOrder, 0), createdAt
        FROM ProductRecipe_old
      `);

      // Drop old table
      db.exec(`DROP TABLE ProductRecipe_old`);

      console.log('✅ ProductRecipe table migration complete');
    }
  } catch (e) {
    // Table doesn't exist yet, or migration already done
  }

  // Material Price History (audit trail for cost changes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS MaterialPriceHistory (
      id TEXT PRIMARY KEY,
      materialId TEXT NOT NULL,
      previousCost REAL NOT NULL,
      newCost REAL NOT NULL,
      previousCostPerUnit REAL NOT NULL,
      newCostPerUnit REAL NOT NULL,
      purchaseQuantity REAL NOT NULL,
      notes TEXT,
      changedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (materialId) REFERENCES Material(id) ON DELETE CASCADE
    );
  `);

  // Orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS "Order" (
      id TEXT PRIMARY KEY,
      wcId INTEGER UNIQUE,
      orderNumber TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      customerName TEXT,
      customerPhone TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      totalCost REAL NOT NULL DEFAULT 0,
      totalProfit REAL NOT NULL DEFAULT 0,
      overallMargin REAL NOT NULL DEFAULT 0,
      paymentMethod TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Order Items table with transaction-level tracking
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
  `);

  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_wc_id ON Product(wcId);
    CREATE INDEX IF NOT EXISTS idx_product_sku ON Product(sku);
    CREATE INDEX IF NOT EXISTS idx_material_category ON Material(category);
    CREATE INDEX IF NOT EXISTS idx_recipe_product ON ProductRecipe(productId);
    CREATE INDEX IF NOT EXISTS idx_recipe_material ON ProductRecipe(materialId);
    CREATE INDEX IF NOT EXISTS idx_price_history_material ON MaterialPriceHistory(materialId);
    CREATE INDEX IF NOT EXISTS idx_order_wc_id ON "Order"(wcId);
    CREATE INDEX IF NOT EXISTS idx_order_status ON "Order"(status);
    CREATE INDEX IF NOT EXISTS idx_order_item_order ON OrderItem(orderId);
    CREATE INDEX IF NOT EXISTS idx_order_item_product ON OrderItem(productId);
    CREATE INDEX IF NOT EXISTS idx_order_item_sold_at ON OrderItem(soldAt);
  `);

  // Inventory Consumption tracking (material usage per sale)
  db.exec(`
    CREATE TABLE IF NOT EXISTS InventoryConsumption (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      orderItemId TEXT,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantitySold REAL NOT NULL,
      itemType TEXT NOT NULL DEFAULT 'material',
      materialId TEXT,
      linkedProductId TEXT,
      materialName TEXT,
      linkedProductName TEXT,
      quantityConsumed REAL NOT NULL,
      unit TEXT NOT NULL,
      costPerUnit REAL NOT NULL,
      totalCost REAL NOT NULL,
      consumedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (materialId) REFERENCES Material(id),
      FOREIGN KEY (linkedProductId) REFERENCES Product(id)
    );
  `);

  // Indexes for inventory consumption
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_consumption_order ON InventoryConsumption(orderId);
    CREATE INDEX IF NOT EXISTS idx_consumption_product ON InventoryConsumption(productId);
    CREATE INDEX IF NOT EXISTS idx_consumption_material ON InventoryConsumption(materialId);
    CREATE INDEX IF NOT EXISTS idx_consumption_date ON InventoryConsumption(consumedAt);
  `);

  console.log('✅ Database schema initialized');
}

// Run initialization if this file is executed directly
if (require.main === module) {
  initDatabase();
}
