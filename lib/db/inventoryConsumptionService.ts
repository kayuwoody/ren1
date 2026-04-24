import { db, initDatabase } from './init';
import { v4 as uuidv4 } from 'uuid';
import { getProductRecipe } from './recipeService';
import { getMaterial } from './materialService';
import { getProduct, getProductByWcId } from './productService';
import { adjustBranchStock } from './branchStockService';
import { logStockMovement } from './stockMovementService';

// Ensure database is initialized
initDatabase();

export interface InventoryConsumption {
  id: string;
  orderId: string;
  orderItemId?: string;
  productId: string;
  productName: string;
  productSku?: string;
  quantitySold: number;
  itemType: 'material' | 'product';
  materialId?: string;
  linkedProductId?: string;
  materialName?: string;
  linkedProductName?: string;
  quantityConsumed: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  consumedAt: string;
}

export interface RecordProductSaleOptions {
  orderId: string;
  wcProductId: string | number;
  productName: string;
  quantitySold: number;
  orderItemId?: string;
  bundleSelection?: {
    selectedMandatory: Record<string, string>;
    selectedOptional: string[];
  };
  branchId: string;
}

/**
 * Record inventory consumption when a product is sold
 * This automatically deducts materials from stock based on the product's recipe
 * Recursively processes linked products to deduct all materials in the chain
 */
export async function recordProductSale(
  options: RecordProductSaleOptions
): Promise<InventoryConsumption[]> {
  const { orderId, wcProductId, productName, quantitySold, orderItemId, bundleSelection, branchId } = options;
  return _recordProductSaleInternal(orderId, wcProductId, productName, quantitySold, orderItemId, bundleSelection, 0, '', branchId);
}

async function _recordProductSaleInternal(
  orderId: string,
  wcProductId: string | number,
  productName: string,
  quantitySold: number,
  orderItemId: string | undefined,
  bundleSelection: { selectedMandatory: Record<string, string>; selectedOptional: string[] } | undefined,
  depth: number,
  parentChain: string,
  branchId: string
): Promise<InventoryConsumption[]> {
  const consumptions: InventoryConsumption[] = [];
  const indent = '  '.repeat(depth);

  // Prevent infinite recursion (max 5 levels deep)
  if (depth > 5) {
    console.error(`${indent}❌ Max recursion depth reached for ${productName}`);
    return [];
  }

  const chain = parentChain ? `${parentChain} → ${productName}` : productName;
  console.log(`${indent}📦 Processing${depth > 0 ? ' (linked)' : ''}: ID ${wcProductId}, "${productName}", Qty: ${quantitySold}`);

  // Find product by local ID first, then WooCommerce ID
  let product = getProduct(String(wcProductId));
  if (!product) {
    product = getProductByWcId(Number(wcProductId));
  }

  if (!product) {
    console.warn(`${indent}⚠️  Product with WC ID ${wcProductId} not found in local database`);
    if (depth === 0) {
      console.warn(`${indent}   💡 Tip: Go to /admin/recipes and click "Sync from WooCommerce" to import products`);
    }
    return [];
  }

  console.log(`${indent}   ✓ Found: ID=${product.id}, SKU=${product.sku}`);

  const productId = product.id;
  const now = new Date().toISOString();

  // Record base product cost if it exists (e.g., buying finished goods from supplier)
  if (product.supplierCost > 0) {
    console.log(`${indent}   💰 Base Supplier Cost: RM ${product.supplierCost} × ${quantitySold} = RM ${(product.supplierCost * quantitySold).toFixed(2)}`);

    const consumptionId = uuidv4();
    const baseCostConsumption: InventoryConsumption = {
      id: consumptionId,
      orderId,
      orderItemId,
      productId,
      productName,
      productSku: product.sku,
      quantitySold,
      itemType: 'material',
      materialId: undefined,
      linkedProductId: undefined,
      materialName: `${productName} (Base Supplier Cost)`,
      linkedProductName: undefined,
      quantityConsumed: quantitySold,
      unit: 'unit',
      costPerUnit: product.supplierCost,
      totalCost: product.supplierCost * quantitySold,
      consumedAt: now,
    };

    const stmt = db.prepare(`
      INSERT INTO InventoryConsumption
      (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
       materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
       unit, costPerUnit, totalCost, consumedAt, branchId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      consumptionId, orderId, orderItemId || null, productId, productName,
      quantitySold, 'material', null, null,
      `${productName} (Base Supplier Cost)`, null,
      quantitySold, 'unit', product.supplierCost, baseCostConsumption.totalCost,
      now, branchId
    );

    consumptions.push(baseCostConsumption);
  }

  // Get the product's recipe
  const recipe = getProductRecipe(productId);

  console.log(`${indent}   📋 Recipe: ${recipe.length} items`);

  if (recipe.length === 0) {
    if (product.supplierCost === 0) {
      if (depth === 0) {
        console.log(`${indent}⚠️  No recipe and no supplier cost for ${productName} - no COGS tracked`);
      } else {
        console.warn(`${indent}⚠️  Linked product "${productName}" has no recipe!`);
      }
    }

    if (depth === 0) {
      deductLocalProductStock(productId, quantitySold, productName, branchId, orderId);
      console.log(`${indent}📦 Recorded ${consumptions.length} total consumptions for ${productName} x${quantitySold}`);
    }

    return consumptions;
  }

  // Process each recipe item
  for (const recipeItem of recipe) {
    if (recipeItem.isOptional) continue;

    // Handle bundle selection filtering
    if (bundleSelection && recipeItem.selectionGroup) {
      const uniqueKey = depth === 0 ? `root:${recipeItem.selectionGroup}` : `${productId}:${recipeItem.selectionGroup}`;
      const selectedItemId = bundleSelection.selectedMandatory[uniqueKey];
      const isSelected = recipeItem.linkedProductId === selectedItemId;

      if (!isSelected) {
        console.log(`${indent}   ⏭️  Skipping ${recipeItem.linkedProductName} (not selected in group: ${recipeItem.selectionGroup})`);
        continue;
      } else {
        console.log(`${indent}   ✅ Including ${recipeItem.linkedProductName} (selected in group: ${recipeItem.selectionGroup})`);
      }
    }

    const quantityConsumed = recipeItem.quantity * quantitySold;

    if (recipeItem.itemType === 'material' && recipeItem.materialId) {
      console.log(`${indent}   ✓ Material: ${recipeItem.materialName} -${quantityConsumed}${recipeItem.unit}`);

      const consumptionId = uuidv4();
      const consumption: InventoryConsumption = {
        id: consumptionId, orderId, orderItemId, productId, productName,
        productSku: '', quantitySold,
        itemType: recipeItem.itemType,
        materialId: recipeItem.materialId, linkedProductId: undefined,
        materialName: recipeItem.materialName, linkedProductName: undefined,
        quantityConsumed, unit: recipeItem.unit,
        costPerUnit: recipeItem.costPerUnit || 0,
        totalCost: recipeItem.costPerUnit ? quantityConsumed * recipeItem.costPerUnit : 0,
        consumedAt: now,
      };

      db.prepare(`
        INSERT INTO InventoryConsumption
        (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
         materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
         unit, costPerUnit, totalCost, consumedAt, branchId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        consumptionId, orderId, orderItemId || null, productId, productName,
        quantitySold, 'material', recipeItem.materialId, null,
        recipeItem.materialName, null, quantityConsumed, recipeItem.unit,
        recipeItem.costPerUnit || 0, consumption.totalCost, now, branchId
      );

      consumptions.push(consumption);
      deductMaterialStock(recipeItem.materialId, quantityConsumed, branchId, orderId);
    } else if (recipeItem.itemType === 'product' && recipeItem.linkedProductId) {
      console.log(`${indent}   🔗 Linked: ${recipeItem.linkedProductName} (${quantityConsumed}x)`);

      const linkedProduct = getProduct(recipeItem.linkedProductId);
      if (linkedProduct) {
        const consumptionId = uuidv4();
        const linkedProductConsumption: InventoryConsumption = {
          id: consumptionId, orderId, orderItemId, productId, productName,
          productSku: product.sku, quantitySold,
          itemType: 'product',
          materialId: undefined, linkedProductId: recipeItem.linkedProductId,
          materialName: undefined, linkedProductName: recipeItem.linkedProductName,
          quantityConsumed, unit: 'unit', costPerUnit: 0, totalCost: 0,
          consumedAt: now,
        };

        db.prepare(`
          INSERT INTO InventoryConsumption
          (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
           materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
           unit, costPerUnit, totalCost, consumedAt, branchId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          consumptionId, orderId, orderItemId || null, productId, productName,
          quantitySold, 'product', null, recipeItem.linkedProductId,
          null, recipeItem.linkedProductName, quantityConsumed, 'unit',
          0, 0, now, branchId
        );

        consumptions.push(linkedProductConsumption);

        deductLocalProductStock(linkedProduct.id, quantityConsumed, linkedProduct.name, branchId, orderId);

        const linkedConsumptions = await _recordProductSaleInternal(
          orderId, linkedProduct.wcId || linkedProduct.id, linkedProduct.name,
          quantityConsumed, orderItemId, bundleSelection,
          depth + 1, chain, branchId
        );
        consumptions.push(...linkedConsumptions);
      } else {
        console.warn(`${indent}      ⚠️  Could not find linked product for recursive processing`);
      }
    }
  }

  if (depth === 0) {
    deductLocalProductStock(productId, quantitySold, productName, branchId, orderId);
    console.log(`📦 Recorded ${consumptions.length} total consumptions for ${productName} x${quantitySold}`);
  }

  return consumptions;
}

/**
 * Deduct material from BranchStock and log the movement
 */
function deductMaterialStock(materialId: string, quantity: number, branchId: string, orderId?: string): void {
  const material = getMaterial(materialId);
  if (!material) {
    console.error(`❌ Material ${materialId} not found - cannot deduct stock`);
    return;
  }

  const newBranchStock = adjustBranchStock(branchId, 'material', materialId, -quantity);

  if (newBranchStock < 0) {
    console.warn(`⚠️  Material ${material.name} branch stock went negative: ${newBranchStock} ${material.purchaseUnit}`);
  }
  if (newBranchStock <= material.lowStockThreshold && newBranchStock > material.lowStockThreshold - quantity) {
    console.warn(`🔔 Low stock alert: ${material.name} = ${newBranchStock} ${material.purchaseUnit} (threshold: ${material.lowStockThreshold})`);
  }

  logStockMovement({
    itemType: 'material',
    itemId: materialId,
    itemName: material.name,
    movementType: 'sale',
    quantityChange: -quantity,
    stockBefore: newBranchStock + quantity,
    stockAfter: newBranchStock,
    referenceId: orderId,
    referenceNote: orderId ? `Sale: Order ${orderId}` : undefined,
  });
}

/**
 * Deduct product from BranchStock and log the movement
 */
function deductLocalProductStock(productId: string, quantity: number, productName: string, branchId: string, orderId?: string): void {
  const newBranchStock = adjustBranchStock(branchId, 'product', productId, -quantity);
  console.log(`   📦 BranchStock: ${productName} → ${newBranchStock}`);
  if (newBranchStock < 0) {
    console.warn(`   ⚠️  BranchStock: ${productName} went negative: ${newBranchStock}`);
  }

  logStockMovement({
    itemType: 'product',
    itemId: productId,
    itemName: productName,
    movementType: 'sale',
    quantityChange: -quantity,
    stockBefore: newBranchStock + quantity,
    stockAfter: newBranchStock,
    referenceId: orderId,
    referenceNote: orderId ? `Sale: Order ${orderId}` : undefined,
  });
}

/**
 * Get consumption history for an order
 */
export function getOrderConsumptions(orderId: string): InventoryConsumption[] {
  const stmt = db.prepare(`
    SELECT * FROM InventoryConsumption
    WHERE orderId = ?
    ORDER BY consumedAt
  `);
  return stmt.all(orderId) as InventoryConsumption[];
}

/**
 * Get consumption history for a product
 */
export function getProductConsumptions(
  productId: string,
  startDate?: string,
  endDate?: string
): InventoryConsumption[] {
  let query = 'SELECT * FROM InventoryConsumption WHERE productId = ?';
  const params: any[] = [productId];

  if (startDate) { query += ' AND consumedAt >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND consumedAt <= ?'; params.push(endDate); }

  query += ' ORDER BY consumedAt DESC';
  return db.prepare(query).all(...params) as InventoryConsumption[];
}

/**
 * Get consumption history for a material
 */
export function getMaterialConsumptions(
  materialId: string,
  startDate?: string,
  endDate?: string
): InventoryConsumption[] {
  let query = 'SELECT * FROM InventoryConsumption WHERE materialId = ?';
  const params: any[] = [materialId];

  if (startDate) { query += ' AND consumedAt >= ?'; params.push(startDate); }
  if (endDate) { query += ' AND consumedAt <= ?'; params.push(endDate); }

  query += ' ORDER BY consumedAt DESC';
  return db.prepare(query).all(...params) as InventoryConsumption[];
}

/**
 * Get total consumption for a date range
 */
export function getConsumptionSummary(
  startDate: string,
  endDate: string
): {
  totalOrders: number;
  totalProductsSold: number;
  totalCost: number;
  byMaterial: Array<{
    materialId: string;
    materialName: string;
    quantityConsumed: number;
    unit: string;
    totalCost: number;
  }>;
} {
  const summary = db.prepare(`
    SELECT
      COUNT(DISTINCT orderId) as totalOrders,
      SUM(quantitySold) as totalProductsSold,
      SUM(totalCost) as totalCost
    FROM InventoryConsumption
    WHERE consumedAt >= ? AND consumedAt <= ?
  `).get(startDate, endDate) as any;

  const byMaterial = db.prepare(`
    SELECT
      materialId, materialName,
      SUM(quantityConsumed) as quantityConsumed,
      unit, SUM(totalCost) as totalCost
    FROM InventoryConsumption
    WHERE consumedAt >= ? AND consumedAt <= ? AND materialId IS NOT NULL
    GROUP BY materialId, materialName, unit
    ORDER BY totalCost DESC
  `).all(startDate, endDate) as any[];

  return {
    totalOrders: summary.totalOrders || 0,
    totalProductsSold: summary.totalProductsSold || 0,
    totalCost: summary.totalCost || 0,
    byMaterial: byMaterial.map(m => ({
      materialId: m.materialId,
      materialName: m.materialName,
      quantityConsumed: m.quantityConsumed,
      unit: m.unit,
      totalCost: m.totalCost,
    })),
  };
}

/**
 * Calculate COGS for a product sale (recursively expands linked products)
 */
export function calculateProductCOGS(
  wcProductId: string | number,
  quantity: number,
  bundleSelection?: {
    selectedMandatory: Record<string, string>;
    selectedOptional: string[];
  },
  depth: number = 0,
  parentChain: string = ''
): {
  totalCOGS: number;
  breakdown: Array<{
    itemType: 'material' | 'product' | 'base';
    itemId: string;
    itemName: string;
    quantityUsed: number;
    unit: string;
    costPerUnit: number;
    totalCost: number;
    depth: number;
    productChain: string;
  }>;
} {
  let product = getProduct(String(wcProductId));
  if (!product) {
    product = getProductByWcId(Number(wcProductId));
  }

  if (!product) {
    console.warn(`⚠️  Product ${wcProductId} not found - COGS calculation skipped`);
    return { totalCOGS: 0, breakdown: [] };
  }

  const chain = parentChain ? `${parentChain} → ${product.name}` : product.name;
  const recipe = getProductRecipe(product.id);

  const breakdown: Array<{
    itemType: 'material' | 'product' | 'base';
    itemId: string; itemName: string; quantityUsed: number;
    unit: string; costPerUnit: number; totalCost: number;
    depth: number; productChain: string;
  }> = [];

  if (product.supplierCost > 0) {
    breakdown.push({
      itemType: 'base', itemId: product.id,
      itemName: `${product.name} (Base Supplier Cost)`,
      quantityUsed: quantity, unit: 'unit',
      costPerUnit: product.supplierCost,
      totalCost: product.supplierCost * quantity,
      depth, productChain: chain,
    });
  }

  recipe
    .filter(item => !item.isOptional)
    .forEach(item => {
      if (bundleSelection && item.selectionGroup) {
        const uniqueKey = depth === 0 ? `root:${item.selectionGroup}` : `${product.id}:${item.selectionGroup}`;
        const selectedItemId = bundleSelection.selectedMandatory[uniqueKey];
        if (item.linkedProductId !== selectedItemId) return;
      }

      if (item.itemType === 'material' && item.materialId) {
        breakdown.push({
          itemType: 'material', itemId: item.materialId,
          itemName: item.materialName || '',
          quantityUsed: item.quantity * quantity, unit: item.unit,
          costPerUnit: item.costPerUnit || 0,
          totalCost: item.calculatedCost * quantity,
          depth, productChain: chain,
        });
      } else if (item.itemType === 'product' && item.linkedProductId) {
        const linkedProduct = getProduct(item.linkedProductId);
        if (linkedProduct) {
          breakdown.push({
            itemType: 'product', itemId: item.linkedProductId,
            itemName: item.linkedProductName || linkedProduct.name,
            quantityUsed: item.quantity * quantity, unit: 'unit',
            costPerUnit: 0, totalCost: 0,
            depth, productChain: chain,
          });

          const linkedCOGS = calculateProductCOGS(
            linkedProduct.wcId || linkedProduct.id, item.quantity * quantity,
            bundleSelection, depth + 1, chain
          );
          breakdown.push(...linkedCOGS.breakdown);
        }
      }
    });

  return { totalCOGS: breakdown.reduce((sum, item) => sum + item.totalCost, 0), breakdown };
}
