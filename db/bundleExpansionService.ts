import { getProduct, getProductByWcId } from './productService';
import { getProductRecipe } from './recipeService';

/**
 * Represents a component in an expanded bundle
 */
export interface BundleComponent {
  productId: string;
  productName: string;
  productSku?: string;
  wcId?: number;
  quantity: number;
  basePrice: number;        // The product's base/sales price
  totalPrice: number;       // basePrice × quantity
  unitCost: number;         // COGS per unit
  totalCost: number;        // unitCost × quantity
  depth: number;            // Nesting level (0 = top level)
  isLinkedProduct: boolean; // True if this is a component, false if main product
  parentChain: string;      // For debugging: "Parent → Child → GrandChild"
}

/**
 * Bundle selection format
 */
export interface BundleSelection {
  selectedMandatory: Record<string, string>; // groupName -> selectedProductId
  selectedOptional: string[];                // array of selected product IDs
}

/**
 * Recursively expand ANY product that has linked products in its recipe
 *
 * This works universally for:
 * - Combo/bundle products (e.g., "Wake up Wonder" → Danish + Americano)
 * - Products with selection groups (e.g., "Latte" → Hot or Iced)
 * - Nested structures (e.g., combo containing another combo)
 * - Any recipe with linked products, regardless of whether it's called a "combo"
 *
 * The function:
 * 1. Starts with any product
 * 2. Gets its recipe (which may contain linked products)
 * 3. Applies XOR selection filtering (only include selected items from choice groups)
 * 4. Recursively expands any nested linked products
 * 5. Returns a flat list of all component products with pricing and cost info
 *
 * Use cases:
 * - Price calculation (handles nested XORs correctly)
 * - Display expanded line items in checkout/receipts/customer display
 * - COGS calculation (sum totalCost of all components)
 *
 * @param productId - Local database product ID
 * @param bundleSelection - User's selections for XOR groups and optional items
 * @param quantity - How many units of this product
 * @param depth - Current recursion depth (internal use)
 * @param parentChain - Chain of parent products (internal use)
 * @returns Array of component products with pricing/cost info
 */
export function expandBundle(
  productId: string,
  bundleSelection?: BundleSelection,
  quantity: number = 1,
  depth: number = 0,
  parentChain: string = ''
): BundleComponent[] {
  const components: BundleComponent[] = [];
  const indent = '  '.repeat(depth);

  // Prevent infinite recursion (max 5 levels deep)
  if (depth > 5) {
    console.error(`${indent}❌ Max recursion depth reached for product ${productId}`);
    return [];
  }

  // Get the product
  const product = getProduct(productId);
  if (!product) {
    console.warn(`${indent}⚠️  Product ${productId} not found in database`);
    return [];
  }

  const chain = parentChain ? `${parentChain} → ${product.name}` : product.name;
  console.log(`${indent}📦 Expanding: "${product.name}" (Qty: ${quantity})`);

  // Get the product's recipe
  const recipe = getProductRecipe(productId);
  console.log(`${indent}   📋 Recipe has ${recipe.length} items`);

  if (recipe.length === 0) {
    // This is a simple product with no linked products
    // Only include if it's a linked product (depth > 0)
    if (depth > 0) {
      console.log(`${indent}   ✓ Simple product - adding as component`);
      components.push({
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        wcId: product.wcId,
        quantity,
        basePrice: product.basePrice,
        totalPrice: product.basePrice * quantity,
        unitCost: product.supplierCost || 0,
        totalCost: (product.supplierCost || 0) * quantity,
        depth,
        isLinkedProduct: true,
        parentChain: chain,
      });
    }
    return components;
  }

  // Process each recipe item
  recipe.forEach((recipeItem, index) => {
    // Skip optional items unless explicitly selected
    if (recipeItem.isOptional) {
      const isSelected = bundleSelection?.selectedOptional.includes(recipeItem.linkedProductId || '');
      if (!isSelected) {
        console.log(`${indent}   ⏭️  Skipping optional: ${recipeItem.linkedProductName} (not selected)`);
        return;
      } else {
        console.log(`${indent}   ✅ Including optional: ${recipeItem.linkedProductName} (selected)`);
      }
    }

    // Handle bundle selection filtering for XOR groups (only at depth 0 - the main product)
    if (depth === 0 && bundleSelection && recipeItem.selectionGroup) {
      // This item is part of a selection group (XOR choice like Hot vs Iced)
      const selectedItemId = bundleSelection.selectedMandatory[recipeItem.selectionGroup];

      // Check if this specific item was selected
      const isSelected = recipeItem.linkedProductId === selectedItemId;

      if (!isSelected) {
        console.log(`${indent}   ⏭️  Skipping: ${recipeItem.linkedProductName} (not selected in group: ${recipeItem.selectionGroup})`);
        return; // Skip this item - it wasn't selected
      } else {
        console.log(`${indent}   ✅ Including: ${recipeItem.linkedProductName} (selected in group: ${recipeItem.selectionGroup})`);
      }
    }

    // Only process linked products (not raw materials)
    if (recipeItem.itemType !== 'product' || !recipeItem.linkedProductId) {
      console.log(`${indent}   ⏭️  Skipping non-product item: ${recipeItem.materialName || recipeItem.linkedProductName}`);
      return;
    }

    const linkedProduct = getProduct(recipeItem.linkedProductId);
    if (!linkedProduct) {
      console.warn(`${indent}   ⚠️  Linked product ${recipeItem.linkedProductId} not found`);
      return;
    }

    console.log(`${indent}   🔗 Processing linked product: ${linkedProduct.name}`);

    // Calculate quantity for this component
    const componentQuantity = recipeItem.quantity * quantity;

    // Add this linked product as a component
    components.push({
      productId: linkedProduct.id,
      productName: linkedProduct.name,
      productSku: linkedProduct.sku,
      wcId: linkedProduct.wcId,
      quantity: componentQuantity,
      basePrice: linkedProduct.basePrice,
      totalPrice: linkedProduct.basePrice * componentQuantity,
      unitCost: linkedProduct.supplierCost || 0,
      totalCost: (linkedProduct.supplierCost || 0) * componentQuantity,
      depth: depth + 1,
      isLinkedProduct: true,
      parentChain: chain,
    });

    // Recursively expand this linked product (in case it's also a bundle)
    // Note: We don't pass bundleSelection to nested products - selection filtering only happens at top level
    const nestedComponents = expandBundle(
      linkedProduct.id,
      undefined, // Clear bundle selection for nested products
      componentQuantity,
      depth + 1,
      chain
    );

    components.push(...nestedComponents);
  });

  if (depth === 0) {
    console.log(`📦 Expanded "${product.name}" into ${components.length} components`);
  }

  return components;
}

/**
 * Expand bundle using WooCommerce product ID (convenience wrapper)
 */
export function expandBundleByWcId(
  wcProductId: number,
  bundleSelection?: BundleSelection,
  quantity: number = 1
): BundleComponent[] {
  const product = getProductByWcId(wcProductId);
  if (!product) {
    console.warn(`⚠️  Product with WC ID ${wcProductId} not found`);
    return [];
  }
  return expandBundle(product.id, bundleSelection, quantity);
}

/**
 * Calculate the total price for a bundle based on its expanded components
 *
 * @param productId - Local database product ID
 * @param bundleSelection - User's selections for XOR groups and optional items
 * @param quantity - How many units of this product
 * @returns Total price for the bundle
 */
export function calculateBundlePrice(
  productId: string,
  bundleSelection?: BundleSelection,
  quantity: number = 1
): number {
  const product = getProduct(productId);
  if (!product) {
    return 0;
  }

  // Check if product has combo price override
  if (product.comboPriceOverride !== undefined && product.comboPriceOverride !== null) {
    console.log(`💰 Using combo price override: RM ${product.comboPriceOverride}`);
    return product.comboPriceOverride * quantity;
  }

  // Get expanded components
  const components = expandBundle(productId, bundleSelection, quantity);

  if (components.length === 0) {
    // No components, use base price
    console.log(`💰 No components, using base price: RM ${product.basePrice}`);
    return product.basePrice * quantity;
  }

  // Sum up total prices of all components
  const total = components.reduce((sum, component) => sum + component.totalPrice, 0);
  console.log(`💰 Calculated bundle price from ${components.length} components: RM ${total.toFixed(2)}`);

  return total;
}

/**
 * Calculate the total COGS for a bundle based on its expanded components
 *
 * @param productId - Local database product ID
 * @param bundleSelection - User's selections for XOR groups and optional items
 * @param quantity - How many units of this product
 * @returns Total COGS for the bundle
 */
export function calculateBundleCOGS(
  productId: string,
  bundleSelection?: BundleSelection,
  quantity: number = 1
): number {
  const components = expandBundle(productId, bundleSelection, quantity);
  const totalCOGS = components.reduce((sum, component) => sum + component.totalCost, 0);

  console.log(`💵 Calculated bundle COGS from ${components.length} components: RM ${totalCOGS.toFixed(2)}`);

  return totalCOGS;
}

/**
 * Get only the DIRECT components of a bundle for customer-facing display
 * This does NOT recurse - it only shows the immediate linked products (depth 1)
 *
 * Example: "Wake up Wonder" → ["Americano", "Danish"] (stops there, doesn't show coffee beans, flour, etc.)
 *
 * @param productId - Local database product ID
 * @param bundleSelection - User's selections for XOR groups and optional items
 * @param quantity - How many units of this product
 * @returns Array of direct component products only (depth 1)
 */
export function getBundleDirectComponents(
  productId: string,
  bundleSelection?: BundleSelection,
  quantity: number = 1
): BundleComponent[] {
  const product = getProduct(productId);
  if (!product) {
    return [];
  }

  const recipe = getProductRecipe(productId);
  const components: BundleComponent[] = [];

  recipe.forEach((recipeItem) => {
    // Skip optional items unless explicitly selected
    if (recipeItem.isOptional) {
      const isSelected = bundleSelection?.selectedOptional.includes(recipeItem.linkedProductId || '');
      if (!isSelected) {
        return;
      }
    }

    // Handle bundle selection filtering for XOR groups
    if (bundleSelection && recipeItem.selectionGroup) {
      const selectedItemId = bundleSelection.selectedMandatory[recipeItem.selectionGroup];
      const isSelected = recipeItem.linkedProductId === selectedItemId;
      if (!isSelected) {
        return; // Skip this item - it wasn't selected
      }
    }

    // Only process linked products (not raw materials)
    if (recipeItem.itemType !== 'product' || !recipeItem.linkedProductId) {
      return;
    }

    const linkedProduct = getProduct(recipeItem.linkedProductId);
    if (!linkedProduct) {
      return;
    }

    const componentQuantity = recipeItem.quantity * quantity;

    // Add ONLY this linked product - do NOT recurse
    components.push({
      productId: linkedProduct.id,
      productName: linkedProduct.name,
      productSku: linkedProduct.sku,
      wcId: linkedProduct.wcId,
      quantity: componentQuantity,
      basePrice: linkedProduct.basePrice,
      totalPrice: linkedProduct.basePrice * componentQuantity,
      unitCost: linkedProduct.supplierCost || 0,
      totalCost: (linkedProduct.supplierCost || 0) * componentQuantity,
      depth: 1, // Always depth 1 (direct children only)
      isLinkedProduct: true,
      parentChain: product.name,
    });
  });

  return components;
}

/**
 * Get only direct components using WooCommerce product ID (convenience wrapper)
 */
export function getBundleDirectComponentsByWcId(
  wcProductId: number,
  bundleSelection?: BundleSelection,
  quantity: number = 1
): BundleComponent[] {
  const product = getProductByWcId(wcProductId);
  if (!product) {
    console.warn(`⚠️  Product with WC ID ${wcProductId} not found`);
    return [];
  }
  return getBundleDirectComponents(product.id, bundleSelection, quantity);
}
