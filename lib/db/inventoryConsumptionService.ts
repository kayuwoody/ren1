import { db, initDatabase } from './init';
import { v4 as uuidv4 } from 'uuid';
import { getProductRecipe } from './recipeService';
import { getMaterial } from './materialService';
import { getProduct, getProductByWcId } from './productService';
import { adjustBranchStock } from './branchStockService';

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
  console.log(`${indent}📦 Processing${depth > 0 ? ' (linked)' : ''}: WC ID ${wcProductId}, "${productName}", Qty: ${quantitySold}`);

  // Find product by WooCommerce ID
  const product = getProductByWcId(Number(wcProductId));

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
      itemType: 'material', // Use 'material' type for consistency
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

    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO InventoryConsumption
      (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
       materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
       unit, costPerUnit, totalCost, consumedAt, branchId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      consumptionId,
      orderId,
      orderItemId || null,
      productId,
      productName,
      quantitySold,
      'material',
      null,
      null,
      `${productName} (Base Supplier Cost)`,
      null,
      quantitySold,
      'unit',
      product.supplierCost,
      baseCostConsumption.totalCost,
      now,
      branchId
    );

    consumptions.push(baseCostConsumption);
  }

  // Get the product's recipe
  const recipe = getProductRecipe(productId);

  console.log(`${indent}   📋 Recipe: ${recipe.length} items`);

  if (recipe.length === 0) {
    // If no recipe but has base cost, that's fine (e.g., bought muffin with no additional materials)
    if (product.supplierCost === 0) {
      if (depth === 0) {
        console.log(`${indent}⚠️  No recipe and no supplier cost for ${productName} - no COGS tracked`);
        console.log(`${indent}   💡 Tip: Either add a recipe or set supplierCost in product settings`);
      } else {
        console.warn(`${indent}⚠️  Linked product "${productName}" has no recipe!`);
      }
    }

    // Still deduct stock for products with no recipe (e.g., supplier-bought items like pies)
    if (depth === 0) {
      deductLocalProductStock(productId, quantitySold, productName, branchId);
      console.log(`${indent}📦 Recorded ${consumptions.length} total consumptions for ${productName} x${quantitySold}`);
    }

    return consumptions;
  }

  // Process each recipe item
  for (const recipeItem of recipe) {
    // Skip optional items (add-ons that weren't necessarily used)
    if (recipeItem.isOptional) {
      continue;
    }

    // Handle bundle selection filtering (works at all depths with unified selection format)
    if (bundleSelection && recipeItem.selectionGroup) {
      const uniqueKey = depth === 0 ? `root:${recipeItem.selectionGroup}` : `${productId}:${recipeItem.selectionGroup}`;

      const selectedItemId = bundleSelection.selectedMandatory[uniqueKey];

      // Check if this specific item was selected
      const isSelected = recipeItem.linkedProductId === selectedItemId;

      if (!isSelected) {
        console.log(`${indent}   ⏭️  Skipping ${recipeItem.linkedProductName} (not selected in group: ${recipeItem.selectionGroup}, key: ${uniqueKey})`);
        continue; // Skip this item - it wasn't selected
      } else {
        console.log(`${indent}   ✅ Including ${recipeItem.linkedProductName} (selected in group: ${recipeItem.selectionGroup}, key: ${uniqueKey})`);
      }
    }

    // Calculate total consumed (recipe quantity × units sold)
    const quantityConsumed = recipeItem.quantity * quantitySold;

    // Handle material vs linked product
    if (recipeItem.itemType === 'material' && recipeItem.materialId) {
      // Direct material - record consumption and deduct from stock
      console.log(`${indent}   ✓ Material: ${recipeItem.materialName} -${quantityConsumed}${recipeItem.unit}`);

      const consumptionId = uuidv4();
      const consumption: InventoryConsumption = {
        id: consumptionId,
        orderId,
        orderItemId,
        productId,
        productName,
        productSku: '',
        quantitySold,
        itemType: recipeItem.itemType,
        materialId: recipeItem.materialId,
        linkedProductId: undefined,
        materialName: recipeItem.materialName,
        linkedProductName: undefined,
        quantityConsumed,
        unit: recipeItem.unit,
        costPerUnit: recipeItem.costPerUnit || 0,
        totalCost: recipeItem.costPerUnit ? quantityConsumed * recipeItem.costPerUnit : 0,
        consumedAt: now,
      };

      // Insert into database
      const stmt = db.prepare(`
        INSERT INTO InventoryConsumption
        (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
         materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
         unit, costPerUnit, totalCost, consumedAt, branchId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        consumptionId,
        orderId,
        orderItemId || null,
        productId,
        productName,
        quantitySold,
        'material',
        recipeItem.materialId,
        null,
        recipeItem.materialName,
        null,
        quantityConsumed,
        recipeItem.unit,
        recipeItem.costPerUnit || 0,
        consumption.totalCost,
        now,
        branchId
      );

      console.log(`${indent}      💾 Stored consumption: orderItemId=${orderItemId || 'null'}, material=${recipeItem.materialName}`);

      consumptions.push(consumption);
      deductMaterialStock(recipeItem.materialId, quantityConsumed, branchId);
    } else if (recipeItem.itemType === 'product' && recipeItem.linkedProductId) {
      // Linked product - record the product itself AND recursively process its materials
      console.log(`${indent}   🔗 Linked: ${recipeItem.linkedProductName} (${quantityConsumed}x)`);

      // Get the linked product to find its WC ID
      const linkedProduct = getProduct(recipeItem.linkedProductId);
      if (linkedProduct && linkedProduct.wcId) {
        // Record the linked product itself as a consumption entry (for visibility only)
        const consumptionId = uuidv4();
        const linkedProductConsumption: InventoryConsumption = {
          id: consumptionId,
          orderId,
          orderItemId,
          productId,
          productName,
          productSku: product.sku,
          quantitySold,
          itemType: 'product',
          materialId: undefined,
          linkedProductId: recipeItem.linkedProductId,
          materialName: undefined,
          linkedProductName: recipeItem.linkedProductName,
          quantityConsumed,
          unit: 'unit',
          costPerUnit: 0,
          totalCost: 0,
          consumedAt: now,
        };

        // Insert the linked product consumption record
        const stmt = db.prepare(`
          INSERT INTO InventoryConsumption
          (id, orderId, orderItemId, productId, productName, quantitySold, itemType,
           materialId, linkedProductId, materialName, linkedProductName, quantityConsumed,
           unit, costPerUnit, totalCost, consumedAt, branchId)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          consumptionId,
          orderId,
          orderItemId || null,
          productId,
          productName,
          quantitySold,
          'product',
          null,
          recipeItem.linkedProductId,
          null,
          recipeItem.linkedProductName,
          quantityConsumed,
          'unit',
          0,
          0,
          now,
          branchId
        );

        console.log(`${indent}      💾 Stored linked product (visibility only): ${recipeItem.linkedProductName} x${quantityConsumed}`);
        consumptions.push(linkedProductConsumption);

        // Deduct BranchStock for linked product
        deductLocalProductStock(linkedProduct.id, quantityConsumed, linkedProduct.name, branchId);

        // Then recursively process the linked product's materials
        const linkedConsumptions = await _recordProductSaleInternal(
          orderId,
          linkedProduct.wcId,
          linkedProduct.name,
          quantityConsumed,
          orderItemId,
          bundleSelection,
          depth + 1,
          chain,
          branchId
        );
        consumptions.push(...linkedConsumptions);
      } else {
        console.warn(`${indent}      ⚠️  Could not find linked product for recursive processing`);
      }
    }
  }

  // Deduct local DB stock for the main product (only at root level, not for linked products)
  if (depth === 0) {
    deductLocalProductStock(productId, quantitySold, productName, branchId);
    console.log(`📦 Recorded ${consumptions.length} total consumptions for ${productName} x${quantitySold}`);
  }

  return consumptions;
}

/**
 * Deduct material from BranchStock (source of truth)
 */
function deductMaterialStock(materialId: string, quantity: number, branchId: string): void {
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
}

/**
 * Deduct product from BranchStock (source of truth)
 */
function deductLocalProductStock(productId: string, quantity: number, productName: string, branchId: string): void {
  const newBranchStock = adjustBranchStock(branchId, 'product', productId, -quantity);
  console.log(`   📦 BranchStock: ${productName} → ${newBranchStock}`);
  if (newBranchStock < 0) {
    console.warn(`   ⚠️  BranchStock: ${productName} went negative: ${newBranchStock}`);
  }
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
  const results = stmt.all(orderId) as InventoryConsumption[];

  // Debug logging
  console.log(`🔍 getOrderConsumptions("${orderId}"): Found ${results.length} records`);
  if (results.length > 0) {
    console.log(`   First record: orderItemId=${results[0].orderItemId} (type: ${typeof results[0].orderItemId})`);
  }

  return results;
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

  if (startDate) {
    query += ' AND consumedAt >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND consumedAt <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY consumedAt DESC';

  const stmt = db.prepare(query);
  return stmt.all(...params) as InventoryConsumption[];
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

  if (startDate) {
    query += ' AND consumedAt >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND consumedAt <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY consumedAt DESC';

  const stmt = db.prepare(query);
  return stmt.all(...params) as InventoryConsumption[];
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
  // Total orders and products
  const summaryStmt = db.prepare(`
    SELECT
      COUNT(DISTINCT orderId) as totalOrders,
      SUM(quantitySold) as totalProductsSold,
      SUM(totalCost) as totalCost
    FROM InventoryConsumption
    WHERE consumedAt >= ? AND consumedAt <= ?
  `);
  const summary = summaryStmt.get(startDate, endDate) as any;

  // Group by material
  const byMaterialStmt = db.prepare(`
    SELECT
      materialId,
      materialName,
      SUM(quantityConsumed) as quantityConsumed,
      unit,
      SUM(totalCost) as totalCost
    FROM InventoryConsumption
    WHERE consumedAt >= ? AND consumedAt <= ? AND materialId IS NOT NULL
    GROUP BY materialId, materialName, unit
    ORDER BY totalCost DESC
  `);
  const byMaterial = byMaterialStmt.all(startDate, endDate) as any[];

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
  // Find product by WooCommerce ID
  const product = getProductByWcId(Number(wcProductId));

  if (!product) {
    console.warn(`⚠️  Product with WC ID ${wcProductId} not found - COGS calculation skipped`);
    return { totalCOGS: 0, breakdown: [] };
  }

  const chain = parentChain ? `${parentChain} → ${product.name}` : product.name;
  const recipe = getProductRecipe(product.id);

  const breakdown: Array<{
    itemType: 'material' | 'product' | 'base';
    itemId: string;
    itemName: string;
    quantityUsed: number;
    unit: string;
    costPerUnit: number;
    totalCost: number;
    depth: number;
    productChain: string;
  }> = [];

  // Add base product cost if it exists (e.g., buying muffins from supplier)
  if (product.supplierCost > 0) {
    breakdown.push({
      itemType: 'base',
      itemId: product.id,
      itemName: `${product.name} (Base Supplier Cost)`,
      quantityUsed: quantity,
      unit: 'unit',
      costPerUnit: product.supplierCost,
      totalCost: product.supplierCost * quantity,
      depth,
      productChain: chain,
    });
  }

  // Add recipe materials/linked products
  recipe
    .filter(item => !item.isOptional)
    .forEach(item => {
      // Handle bundle selection filtering (works at all depths with unified selection format)
      if (bundleSelection && item.selectionGroup) {
        const uniqueKey = depth === 0 ? `root:${item.selectionGroup}` : `${product.id}:${item.selectionGroup}`;
        const selectedItemId = bundleSelection.selectedMandatory[uniqueKey];

        const isSelected = item.linkedProductId === selectedItemId;

        if (!isSelected) {
          return;
        }
      }

      if (item.itemType === 'material' && item.materialId) {
        breakdown.push({
          itemType: 'material',
          itemId: item.materialId,
          itemName: item.materialName || '',
          quantityUsed: item.quantity * quantity,
          unit: item.unit,
          costPerUnit: item.costPerUnit || 0,
          totalCost: item.calculatedCost * quantity,
          depth,
          productChain: chain,
        });
      } else if (item.itemType === 'product' && item.linkedProductId) {
        const linkedProduct = getProduct(item.linkedProductId);
        if (linkedProduct && linkedProduct.wcId) {
          breakdown.push({
            itemType: 'product',
            itemId: item.linkedProductId,
            itemName: item.linkedProductName || linkedProduct.name,
            quantityUsed: item.quantity * quantity,
            unit: 'unit',
            costPerUnit: 0,
            totalCost: 0,
            depth,
            productChain: chain,
          });

          const linkedCOGS = calculateProductCOGS(
            linkedProduct.wcId,
            item.quantity * quantity,
            bundleSelection,
            depth + 1,
            chain
          );
          breakdown.push(...linkedCOGS.breakdown);
        }
      }
    });

  const totalCOGS = breakdown.reduce((sum, item) => sum + item.totalCost, 0);

  return {
    totalCOGS,
    breakdown,
  };
}
