import { getProduct, getProductByWcId } from './productService';
import { getProductRecipe, ProductRecipeItem } from './recipeService';

/**
 * Represents a flattened XOR group from any nesting level
 */
export interface FlattenedXORGroup {
  uniqueKey: string;           // e.g., "root:Pastry" or "Americano:Temperature"
  displayName: string;          // e.g., "Choose Pastry" or "Choose Americano Temperature"
  parentProductId?: string;     // ID of product this group belongs to (undefined for root)
  parentProductName?: string;   // Name of parent product
  groupName: string;            // Original group name from recipe
  items: Array<{
    id: string;                 // Product ID
    name: string;
    priceAdjustment: number;
  }>;
}

/**
 * Represents a flattened optional item from any nesting level
 */
export interface FlattenedOptionalItem {
  id: string;
  name: string;
  priceAdjustment: number;
  parentProductId?: string;
  parentProductName?: string;
}

/**
 * Unified selection format that works across all nesting levels
 */
export interface UnifiedBundleSelection {
  selectedMandatory: Record<string, string>; // uniqueKey -> selectedProductId
  selectedOptional: string[];                // array of selected product IDs
}

/**
 * Recursively collect ALL XOR groups and optional items from a product and its nested linked products.
 * This flattens the entire tree so the modal can show all choices at once.
 *
 * Example:
 *   Wake up Wonder (root)
 *   ├─ Danish (has XOR: Blueberry/Cheese with group "Pastry")
 *   └─ Americano (has XOR: Hot/Iced with group "Temperature")
 *
 * Returns:
 *   - XOR Group "root:Pastry" with Blueberry/Cheese options
 *   - XOR Group "Americano:Temperature" with Hot/Iced options
 *
 * @param productId - Local database product ID
 * @param depth - Current recursion depth (internal)
 * @param parentPath - Path of parent products (internal)
 * @returns All XOR groups and optional items from all nesting levels
 */
export function flattenAllChoices(
  productId: string,
  depth: number = 0,
  parentPath: string = '',
  parentProductId?: string,
  parentProductName?: string
): {
  xorGroups: FlattenedXORGroup[];
  optionalItems: FlattenedOptionalItem[];
} {
  const xorGroups: FlattenedXORGroup[] = [];
  const optionalItems: FlattenedOptionalItem[] = [];

  // Prevent infinite recursion
  if (depth > 5) {
    console.error(`Max recursion depth reached for product ${productId}`);
    return { xorGroups, optionalItems };
  }

  const product = getProduct(productId);
  if (!product) {
    return { xorGroups, optionalItems };
  }

  const recipe = getProductRecipe(productId);
  const indent = '  '.repeat(depth);

  console.log(`${indent}🔍 Flattening choices for: ${product.name} (depth ${depth})`);

  // Group recipe items by selection group
  const groupedBySelection: Record<string, ProductRecipeItem[]> = {};
  const mandatoryIndividual: ProductRecipeItem[] = [];
  const optional: ProductRecipeItem[] = [];

  recipe.forEach((item) => {
    if (item.isOptional) {
      optional.push(item);
    } else if (item.selectionGroup) {
      if (!groupedBySelection[item.selectionGroup]) {
        groupedBySelection[item.selectionGroup] = [];
      }
      groupedBySelection[item.selectionGroup].push(item);
    } else {
      mandatoryIndividual.push(item);
    }
  });

  // Process XOR groups at this level
  Object.entries(groupedBySelection).forEach(([groupName, items]) => {
    // Generate unique key for this group
    const uniqueKey = depth === 0 ? `root:${groupName}` : `${product.id}:${groupName}`;

    // Generate display name
    const displayName = depth === 0
      ? groupName
      : `${product.name} ${groupName}`;

    console.log(`${indent}  ✓ Found XOR group: ${uniqueKey} (${items.length} items)`);

    xorGroups.push({
      uniqueKey,
      displayName,
      parentProductId: depth === 0 ? undefined : parentProductId,
      parentProductName: depth === 0 ? undefined : parentProductName,
      groupName,
      items: items
        .filter(item => item.itemType === 'product' && item.linkedProductId)
        .map(item => {
          const linkedProd = getProduct(item.linkedProductId!);
          return {
            id: item.linkedProductId!,
            name: item.linkedProductName || linkedProd?.name || 'Unknown',
            priceAdjustment: (item as any).priceAdjustment || 0,
          };
        }),
    });
  });

  // Process optional items at this level (only if they're products)
  optional.forEach(item => {
    if (item.itemType === 'product' && item.linkedProductId) {
      console.log(`${indent}  ⊕ Found optional: ${item.linkedProductName}`);

      const linkedProd = getProduct(item.linkedProductId);
      optionalItems.push({
        id: item.linkedProductId,
        name: item.linkedProductName || linkedProd?.name || 'Unknown',
        priceAdjustment: (item as any).priceAdjustment || 0,
        parentProductId: depth === 0 ? undefined : product.id,
        parentProductName: depth === 0 ? undefined : product.name,
      });
    }
  });

  // Recursively process mandatory individual linked products
  mandatoryIndividual.forEach(item => {
    if (item.itemType === 'product' && item.linkedProductId) {
      console.log(`${indent}  🔗 Recursing into: ${item.linkedProductName}`);

      const nested = flattenAllChoices(
        item.linkedProductId,
        depth + 1,
        parentPath ? `${parentPath} > ${product.name}` : product.name,
        product.id,
        product.name
      );

      xorGroups.push(...nested.xorGroups);
      optionalItems.push(...nested.optionalItems);
    }
  });

  // Also recurse into XOR group items (they might have nested choices too)
  Object.values(groupedBySelection).flat().forEach(item => {
    if (item.itemType === 'product' && item.linkedProductId) {
      const nested = flattenAllChoices(
        item.linkedProductId,
        depth + 1,
        parentPath ? `${parentPath} > ${product.name}` : product.name,
        product.id,
        product.name
      );

      xorGroups.push(...nested.xorGroups);
      optionalItems.push(...nested.optionalItems);
    }
  });

  if (depth === 0) {
    console.log(`\n📊 Total flattened choices for ${product.name}:`);
    console.log(`   XOR Groups: ${xorGroups.length}`);
    xorGroups.forEach(g => console.log(`     - ${g.uniqueKey}: ${g.items.length} items`));
    console.log(`   Optional Items: ${optionalItems.length}\n`);
  }

  return { xorGroups, optionalItems };
}

/**
 * Recursively calculate price based on unified selections
 * Traverses the product tree and applies selections at each level
 */
export function calculatePriceWithSelections(
  productId: string,
  selections: UnifiedBundleSelection,
  quantity: number = 1,
  depth: number = 0
): number {
  const product = getProduct(productId);
  if (!product) return 0;

  // Check for combo price override
  if (depth === 0 && product.comboPriceOverride !== undefined && product.comboPriceOverride !== null) {
    return product.comboPriceOverride * quantity;
  }

  const recipe = getProductRecipe(productId);
  let totalPrice = product.basePrice * quantity;

  recipe.forEach(item => {
    // Skip optional items unless selected
    if (item.isOptional) {
      if (!selections.selectedOptional.includes(item.linkedProductId || '')) {
        return;
      }
    }

    // Handle XOR groups - check selection
    if (item.selectionGroup) {
      const uniqueKey = depth === 0 ? `root:${item.selectionGroup}` : `${productId}:${item.selectionGroup}`;
      const selectedId = selections.selectedMandatory[uniqueKey];

      // Skip if this item wasn't selected in its group
      if (selectedId !== item.linkedProductId) {
        return;
      }
    }

    // Add price adjustment and recurse if needed
    if (item.itemType === 'product' && item.linkedProductId) {
      totalPrice += ((item as any).priceAdjustment || 0) * quantity;

      // Recurse to get nested prices
      const nestedPrice = calculatePriceWithSelections(
        item.linkedProductId,
        selections,
        item.quantity * quantity,
        depth + 1
      );

      totalPrice += nestedPrice;
    }
  });

  return totalPrice;
}

/**
 * Recursively calculate COGS based on unified selections
 */
export function calculateCOGSWithSelections(
  productId: string,
  selections: UnifiedBundleSelection,
  quantity: number = 1,
  depth: number = 0
): number {
  const product = getProduct(productId);
  if (!product) return 0;

  const recipe = getProductRecipe(productId);
  let totalCOGS = (product.supplierCost || 0) * quantity;

  recipe.forEach(item => {
    // Skip optional items unless selected
    if (item.isOptional) {
      if (!selections.selectedOptional.includes(item.linkedProductId || '')) {
        return;
      }
    }

    // Handle XOR groups
    if (item.selectionGroup) {
      const uniqueKey = depth === 0 ? `root:${item.selectionGroup}` : `${productId}:${item.selectionGroup}`;
      const selectedId = selections.selectedMandatory[uniqueKey];

      if (selectedId !== item.linkedProductId) {
        return;
      }
    }

    // Recurse for linked products
    if (item.itemType === 'product' && item.linkedProductId) {
      const nestedCOGS = calculateCOGSWithSelections(
        item.linkedProductId,
        selections,
        item.quantity * quantity,
        depth + 1
      );

      totalCOGS += nestedCOGS;
    } else if (item.itemType === 'material') {
      // Add material costs
      totalCOGS += (item.calculatedCost || 0) * quantity;
    }
  });

  return totalCOGS;
}

/**
 * Get the selected product components for display
 * Recursively follows the selection tree to get the actual selected leaf products
 *
 * Example: If "Wake up Wonder" → "Americano" → "Hot Americano" (selected),
 * this returns "Hot Americano", not "Americano"
 */
export function getSelectedComponents(
  productId: string,
  selections: UnifiedBundleSelection,
  quantity: number = 1,
  depth: number = 0
): Array<{ productId: string; productName: string; quantity: number }> {
  const product = getProduct(productId);
  if (!product) return [];

  const recipe = getProductRecipe(productId);
  const components: Array<{ productId: string; productName: string; quantity: number }> = [];

  // Group recipe items to check for XOR groups
  const hasXORGroups = recipe.some(item => item.selectionGroup);

  recipe.forEach(item => {
    // Skip optional items unless selected
    if (item.isOptional) {
      if (!selections.selectedOptional.includes(item.linkedProductId || '')) {
        return;
      }
    }

    // Handle XOR groups at this level
    if (item.selectionGroup) {
      const uniqueKey = depth === 0 ? `root:${item.selectionGroup}` : `${productId}:${item.selectionGroup}`;
      const selectedId = selections.selectedMandatory[uniqueKey];

      if (selectedId !== item.linkedProductId) {
        return; // This item wasn't selected in the XOR group
      }
    }

    // Only process linked products (not materials)
    if (item.itemType !== 'product' || !item.linkedProductId) {
      return;
    }

    const linkedProd = getProduct(item.linkedProductId);
    if (!linkedProd) {
      return;
    }

    const componentQuantity = item.quantity * quantity;

    // Check if this linked product has XOR groups or linked products (not just materials)
    const linkedRecipe = getProductRecipe(item.linkedProductId);
    const linkedHasXORGroups = linkedRecipe.some(r => r.selectionGroup);
    const linkedHasProducts = linkedRecipe.some(r => r.itemType === 'product');

    console.log(`  🔍 Checking linked product "${linkedProd.name}" (depth=${depth}):`, {
      hasXORGroups: linkedHasXORGroups,
      hasProducts: linkedHasProducts,
      recipeItems: linkedRecipe.map(r => `${r.itemType}:${r.linkedProductName || r.materialName}`)
    });

    // Only recurse if the product has OTHER products BUT NO XOR groups
    // If it has XOR groups, it's a complete product with internal choices (like "Hot Americano") - don't expand
    // If it only has materials, it's a leaf product - don't expand
    if (linkedHasProducts && !linkedHasXORGroups) {
      console.log(`    ↪️  Recursing into "${linkedProd.name}" (has nested products, no XOR)`);
      // This product is a bundle of other products - recurse to get them
      const nestedComponents = getSelectedComponents(
        item.linkedProductId,
        selections,
        componentQuantity,
        depth + 1
      );

      console.log(`    ⬆️  Recursion returned ${nestedComponents.length} components:`, nestedComponents.map(c => c.productName));

      // If recursion found components, use those. Otherwise, use this product.
      if (nestedComponents.length > 0) {
        components.push(...nestedComponents);
      } else {
        // No nested components found, add this product as-is
        console.log(`    ✅ Adding "${linkedProd.name}" (no nested components found)`);
        components.push({
          productId: linkedProd.id,
          productName: linkedProd.name,
          quantity: componentQuantity,
        });
      }
    } else {
      // This product either:
      // 1. Has XOR groups (internal choices like "Hot vs Iced") - it's a complete product, show as-is
      // 2. Only has materials - it's a leaf product, show as-is
      // Either way, don't expand into components

      let displayName = linkedProd.name;

      // If product has XOR groups, include the selected variant in the name
      if (linkedHasXORGroups) {
        const selectedVariants: string[] = [];

        console.log(`    🔎 Looking for selected variants for "${linkedProd.name}":`);
        console.log(`       Available selections:`, selections.selectedMandatory);

        // Find which XOR options were selected for this product
        linkedRecipe.forEach(recipeItem => {
          if (recipeItem.selectionGroup) {
            // Use the product's ID to construct the key (component products have their XOR groups keyed by product ID)
            const uniqueKey = `${item.linkedProductId}:${recipeItem.selectionGroup}`;

            const selectedId = selections.selectedMandatory[uniqueKey];

            console.log(`       Checking group "${recipeItem.selectionGroup}":`, {
              uniqueKey,
              selectedId,
              recipeItemId: recipeItem.linkedProductId,
              recipeItemName: recipeItem.linkedProductName,
              matches: selectedId === recipeItem.linkedProductId
            });

            if (selectedId === recipeItem.linkedProductId) {
              selectedVariants.push(recipeItem.linkedProductName || '');
            }
          }
        });

        // Prepend selected variants to product name
        if (selectedVariants.length > 0) {
          console.log(`       ✓ Found variants:`, selectedVariants);
          displayName = `${selectedVariants.join(' ')} ${linkedProd.name}`;
        } else {
          console.log(`       ✗ No variants found`);
        }
      }

      const reason = linkedHasXORGroups ? 'has internal XOR choices' : 'only has materials';
      console.log(`    ✅ Adding complete product "${displayName}" (${reason})`);
      components.push({
        productId: linkedProd.id,
        productName: displayName,
        quantity: componentQuantity,
      });
    }
  });

  return components;
}
