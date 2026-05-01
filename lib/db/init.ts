import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file location
const dbDir = path.join(process.cwd(), 'prisma');
const dbPath = path.join(dbDir, 'dev.db');

// Ensure prisma directory exists before opening database
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Track if database has been initialized
let isInitialized = false;

// Initialize database schema
export function initDatabase() {
  // Only initialize once
  if (isInitialized) {
    return;
  }
  isInitialized = true;

  // Branch table (must be created first — referenced by other tables)
  db.exec(`
    CREATE TABLE IF NOT EXISTS Branch (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      address TEXT,
      phone TEXT,
      isDefault INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default branch if none exists
  db.exec(`
    INSERT OR IGNORE INTO Branch (id, name, code, isDefault, isActive)
    VALUES ('branch-main', 'Main Branch', 'MAIN', 1, 1);
  `);

  // Migration: Add timezone column to Branch table (future use only)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(Branch)").all() as any[];
    const hasTimezone = tableInfo.some((col: any) => col.name === 'timezone');
    if (tableInfo.length > 0 && !hasTimezone) {
      db.exec(`ALTER TABLE Branch ADD COLUMN timezone TEXT DEFAULT 'Asia/Kuala_Lumpur'`);
    }
  } catch (e) {}

  // Per-branch stock table
  db.exec(`
    CREATE TABLE IF NOT EXISTS BranchStock (
      id TEXT PRIMARY KEY,
      branchId TEXT NOT NULL,
      itemType TEXT NOT NULL,
      itemId TEXT NOT NULL,
      stockQuantity REAL NOT NULL DEFAULT 0,
      lowStockThreshold REAL NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(branchId, itemType, itemId),
      FOREIGN KEY (branchId) REFERENCES Branch(id)
    );
    CREATE INDEX IF NOT EXISTS idx_branch_stock_branch ON BranchStock(branchId);
    CREATE INDEX IF NOT EXISTS idx_branch_stock_item ON BranchStock(itemType, itemId);
  `);

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Product (
      id TEXT PRIMARY KEY,
      wcId INTEGER UNIQUE,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'uncategorized',
      basePrice REAL NOT NULL DEFAULT 0,
      supplierCost REAL NOT NULL DEFAULT 0,
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
      selectionGroup TEXT,
      priceAdjustment REAL NOT NULL DEFAULT 0,
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
          selectionGroup TEXT,
          priceAdjustment REAL NOT NULL DEFAULT 0,
          sortOrder INTEGER NOT NULL DEFAULT 0,
          createdAt TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE,
          FOREIGN KEY (materialId) REFERENCES Material(id),
          FOREIGN KEY (linkedProductId) REFERENCES Product(id)
        )
      `);

      // Copy data from old table
      db.exec(`
        INSERT INTO ProductRecipe (id, productId, itemType, materialId, linkedProductId, quantity, unit, calculatedCost, isOptional, selectionGroup, priceAdjustment, sortOrder, createdAt)
        SELECT id, productId, 'material', materialId, NULL, quantity, unit, calculatedCost,
               COALESCE(isOptional, 0), NULL, 0, COALESCE(sortOrder, 0), createdAt
        FROM ProductRecipe_old
      `);

      // Drop old table
      db.exec(`DROP TABLE ProductRecipe_old`);

      console.log('✅ ProductRecipe table migration complete');
    }
  } catch (e) {
    // Table doesn't exist yet, or migration already done
  }

  // Migration: Add selectionGroup column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(ProductRecipe)").all() as any[];
    const hasSelectionGroup = tableInfo.some((col: any) => col.name === 'selectionGroup');

    if (tableInfo.length > 0 && !hasSelectionGroup) {
      console.log('🔄 Adding selectionGroup column to ProductRecipe table...');
      db.exec(`ALTER TABLE ProductRecipe ADD COLUMN selectionGroup TEXT`);
      console.log('✅ selectionGroup column added');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Migration: Add priceAdjustment column if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(ProductRecipe)").all() as any[];
    const hasPriceAdjustment = tableInfo.some((col: any) => col.name === 'priceAdjustment');

    if (tableInfo.length > 0 && !hasPriceAdjustment) {
      console.log('🔄 Adding priceAdjustment column to ProductRecipe table...');
      db.exec(`ALTER TABLE ProductRecipe ADD COLUMN priceAdjustment REAL NOT NULL DEFAULT 0`);
      console.log('✅ priceAdjustment column added');
      console.log('📝 Note: Price adjustment for XOR options (e.g., +RM 2 for iced vs hot)');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Migration: Add supplierCost column to Product table if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(Product)").all() as any[];
    const hasSupplierCost = tableInfo.some((col: any) => col.name === 'supplierCost');

    if (tableInfo.length > 0 && !hasSupplierCost) {
      console.log('🔄 Adding supplierCost column to Product table...');
      db.exec(`ALTER TABLE Product ADD COLUMN supplierCost REAL NOT NULL DEFAULT 0`);
      console.log('✅ supplierCost column added');
      console.log('📝 Note: supplierCost is for base acquisition cost, unitCost is for calculated COGS');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Migration: Add comboPriceOverride column to Product table if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(Product)").all() as any[];
    const hasComboPriceOverride = tableInfo.some((col: any) => col.name === 'comboPriceOverride');

    if (tableInfo.length > 0 && !hasComboPriceOverride) {
      console.log('🔄 Adding comboPriceOverride column to Product table...');
      db.exec(`ALTER TABLE Product ADD COLUMN comboPriceOverride REAL`);
      console.log('✅ comboPriceOverride column added');
      console.log('📝 Note: When set, this override price is used instead of calculated price (base + add-ons)');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Migration: Add manageStock column to Product table if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(Product)").all() as any[];
    const hasManageStock = tableInfo.some((col: any) => col.name === 'manageStock');

    if (tableInfo.length > 0 && !hasManageStock) {
      console.log('🔄 Adding manageStock column to Product table...');
      db.exec(`ALTER TABLE Product ADD COLUMN manageStock INTEGER NOT NULL DEFAULT 0`);
      console.log('✅ manageStock column added');
      console.log('📝 Note: Stores whether WooCommerce is tracking inventory for this product');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Migration: Add supplier column to Product table if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(Product)").all() as any[];
    const hasSupplier = tableInfo.some((col: any) => col.name === 'supplier');

    if (tableInfo.length > 0 && !hasSupplier) {
      console.log('🔄 Adding supplier column to Product table...');
      db.exec(`ALTER TABLE Product ADD COLUMN supplier TEXT`);
      console.log('✅ supplier column added');
      console.log('📝 Note: Stores the supplier/vendor name for this product');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Add quantityPerCarton column if it doesn't exist
  try {
    const tableInfo = db.prepare('PRAGMA table_info(Product)').all() as Array<{ name: string }>;
    const hasQuantityPerCarton = tableInfo.some(col => col.name === 'quantityPerCarton');

    if (tableInfo.length > 0 && !hasQuantityPerCarton) {
      console.log('🔄 Adding quantityPerCarton column to Product table...');
      db.exec(`ALTER TABLE Product ADD COLUMN quantityPerCarton INTEGER`);
      console.log('✅ quantityPerCarton column added');
      console.log('📝 Note: Number of units per carton for purchase order calculations');
    }
  } catch (e) {
    // Column already exists or table doesn't exist
  }

  // Customer table (local identity — replaces WooCommerce customers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS Customer (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT UNIQUE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_customer_phone ON Customer(phone);
    CREATE INDEX IF NOT EXISTS idx_customer_email ON Customer(email);
  `);

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

  // Stock Check Log (audit trail for stock checks)
  db.exec(`
    CREATE TABLE IF NOT EXISTS StockCheckLog (
      id TEXT PRIMARY KEY,
      checkDate TEXT NOT NULL DEFAULT (datetime('now')),
      itemsChecked INTEGER NOT NULL DEFAULT 0,
      itemsAdjusted INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Stock Check Log Items (individual item adjustments)
  db.exec(`
    CREATE TABLE IF NOT EXISTS StockCheckLogItem (
      id TEXT PRIMARY KEY,
      stockCheckLogId TEXT NOT NULL,
      itemType TEXT NOT NULL,
      itemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      supplier TEXT,
      previousStock REAL NOT NULL,
      countedStock REAL NOT NULL,
      difference REAL NOT NULL,
      unit TEXT NOT NULL,
      note TEXT,
      wcSynced INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (stockCheckLogId) REFERENCES StockCheckLog(id) ON DELETE CASCADE
    );
  `);

  // Indexes for stock check logs
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_check_log_date ON StockCheckLog(checkDate);
    CREATE INDEX IF NOT EXISTS idx_stock_check_log_item_log ON StockCheckLogItem(stockCheckLogId);
    CREATE INDEX IF NOT EXISTS idx_stock_check_log_item_id ON StockCheckLogItem(itemId);
  `);

  // Migration: Add branchId to Order table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(\"Order\")").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to Order table...');
      db.exec(`ALTER TABLE "Order" ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE "Order" SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to Order table');
    }
  } catch (e) { /* column already exists */ }

  // Migration: Add branchId to OrderItem table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(OrderItem)").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to OrderItem table...');
      db.exec(`ALTER TABLE OrderItem ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE OrderItem SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to OrderItem table');
    }
  } catch (e) { /* column already exists */ }

  // Migration: Add branchId to InventoryConsumption table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(InventoryConsumption)").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to InventoryConsumption table...');
      db.exec(`ALTER TABLE InventoryConsumption ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE InventoryConsumption SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to InventoryConsumption table');
    }
  } catch (e) { /* column already exists */ }

  // Migration: Add branchId to StockCheckLog table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(StockCheckLog)").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to StockCheckLog table...');
      db.exec(`ALTER TABLE StockCheckLog ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE StockCheckLog SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to StockCheckLog table');
    }
  } catch (e) { /* column already exists */ }

  // Migration: Add branchId to StockCheckLogItem table
  try {
    const tableInfo = db.prepare("PRAGMA table_info(StockCheckLogItem)").all() as any[];
    const hasBranchId = tableInfo.some((col: any) => col.name === 'branchId');
    if (tableInfo.length > 0 && !hasBranchId) {
      console.log('Adding branchId column to StockCheckLogItem table...');
      db.exec(`ALTER TABLE StockCheckLogItem ADD COLUMN branchId TEXT REFERENCES Branch(id)`);
      db.exec(`UPDATE StockCheckLogItem SET branchId = 'branch-main' WHERE branchId IS NULL`);
      console.log('branchId column added to StockCheckLogItem table');
    }
  } catch (e) { /* column already exists */ }

  // Migration: Add operational columns to Order table (WC decoupling)
  {
    const cols = db.prepare('PRAGMA table_info("Order")').all() as any[];
    const has = (name: string) => cols.some((c: any) => c.name === name);
    if (cols.length > 0) {
      if (!has('customerId'))     db.exec(`ALTER TABLE "Order" ADD COLUMN customerId TEXT REFERENCES Customer(id)`);
      if (!has('guestId'))        db.exec(`ALTER TABLE "Order" ADD COLUMN guestId TEXT`);
      if (!has('startTime'))      db.exec(`ALTER TABLE "Order" ADD COLUMN startTime TEXT`);
      if (!has('endTime'))        db.exec(`ALTER TABLE "Order" ADD COLUMN endTime TEXT`);
      if (!has('kitchenReady'))   db.exec(`ALTER TABLE "Order" ADD COLUMN kitchenReady INTEGER NOT NULL DEFAULT 0`);
      if (!has('outForDelivery')) db.exec(`ALTER TABLE "Order" ADD COLUMN outForDelivery INTEGER NOT NULL DEFAULT 0`);
      if (!has('readyTimestamp')) db.exec(`ALTER TABLE "Order" ADD COLUMN readyTimestamp TEXT`);
      if (!has('lockerNumber'))   db.exec(`ALTER TABLE "Order" ADD COLUMN lockerNumber TEXT`);
      if (!has('pickupCode'))     db.exec(`ALTER TABLE "Order" ADD COLUMN pickupCode TEXT`);
      if (!has('billingName'))    db.exec(`ALTER TABLE "Order" ADD COLUMN billingName TEXT`);
      if (!has('billingPhone'))   db.exec(`ALTER TABLE "Order" ADD COLUMN billingPhone TEXT`);
      if (!has('billingEmail'))   db.exec(`ALTER TABLE "Order" ADD COLUMN billingEmail TEXT`);
      if (!has('billingAddress')) db.exec(`ALTER TABLE "Order" ADD COLUMN billingAddress TEXT`);
    }
  }

  // Indexes for branchId columns on core tables
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_branch ON "Order"(branchId);
    CREATE INDEX IF NOT EXISTS idx_order_item_branch ON OrderItem(branchId);
    CREATE INDEX IF NOT EXISTS idx_consumption_branch ON InventoryConsumption(branchId);
    CREATE INDEX IF NOT EXISTS idx_stock_check_log_branch ON StockCheckLog(branchId);
  `);

  // Migration: Seed BranchStock from existing Material/Product stock (run once)
  try {
    const hasBranchStock = db.prepare("SELECT COUNT(*) as c FROM BranchStock").get() as { c: number };
    if (hasBranchStock.c === 0) {
      console.log('Seeding BranchStock from existing Material and Product stock...');
      db.exec(`
        INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold)
        SELECT 'bs-mat-' || id, 'branch-main', 'material', id, stockQuantity, lowStockThreshold
        FROM Material;

        INSERT OR IGNORE INTO BranchStock (id, branchId, itemType, itemId, stockQuantity, lowStockThreshold)
        SELECT 'bs-prod-' || id, 'branch-main', 'product', id, stockQuantity, 0
        FROM Product WHERE manageStock = 1;
      `);
      console.log('BranchStock seeded');
    }
  } catch (e) { /* table may not have data yet */ }

  // Stock Movement Log (unified audit trail for all stock changes)
  db.exec(`
    CREATE TABLE IF NOT EXISTS StockMovement (
      id TEXT PRIMARY KEY,
      itemType TEXT NOT NULL,
      itemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      movementType TEXT NOT NULL,
      quantityChange REAL NOT NULL,
      stockBefore REAL NOT NULL,
      stockAfter REAL NOT NULL,
      referenceId TEXT,
      referenceNote TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes for stock movement log
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_stock_movement_item ON StockMovement(itemType, itemId);
    CREATE INDEX IF NOT EXISTS idx_stock_movement_type ON StockMovement(movementType);
    CREATE INDEX IF NOT EXISTS idx_stock_movement_date ON StockMovement(createdAt);
  `);

  // Initialize purchase order tables
  try {
    const { initPurchaseOrderTables } = require('./purchaseOrderSchema');
    initPurchaseOrderTables();
  } catch (e) {
    // Silently ignore if purchase order schema doesn't exist
  }
}

// Run initialization when module is first imported
initDatabase();

// Fire-and-forget catalog sync on startup
import('../catalogSync').then(({ syncAllProducts, syncAllRecipes }) => {
  syncAllProducts()
    .then(r => console.log(`Startup catalog sync: ${r.synced}/${r.total} products`))
    .then(() => syncAllRecipes())
    .then(r => console.log(`Startup catalog sync: ${r!.synced}/${r!.total} recipes`))
    .catch(err => console.warn('Startup catalog sync failed (will retry on next restart):', err.message));
});
