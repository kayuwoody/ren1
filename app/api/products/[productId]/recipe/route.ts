import { NextResponse } from 'next/server';
import { getProduct, getProductByWcId } from '@/lib/db/productService';
import { getProductRecipe } from '@/lib/db/recipeService';
import { flattenAllChoices } from '@/lib/db/recursiveProductExpansion';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/products/[productId]/recipe
 *
 * Fetch a product's recipe configuration including:
 * - ALL XOR groups from ALL nesting levels (flattened)
 * - Optional items from all levels
 *
 * This enables the modal to show all choices at once, even if they come from nested products.
 */
export async function GET(
  req: Request,
  { params }: { params: { productId: string } }
) {
  try {
    const { productId } = params;

    // Find product by WooCommerce ID
    const product = getProductByWcId(Number(productId));

    if (!product) {
      return notFoundError('Product not found', '/api/products/[productId]/recipe');
    }

    console.log(`\n🔍 Product: ${product.name} (${product.id})`);

    // Flatten ALL choices from ALL nesting levels
    const { xorGroups, optionalItems } = flattenAllChoices(product.id);

    // Get mandatory individual items at root level (for display purposes)
    // BUT exclude any that have nested XOR groups (those are already shown in the flattened groups)
    const rootRecipe = getProductRecipe(product.id);

    // Find which products have nested XOR groups
    const productsWithNestedXORs = new Set<string>();
    rootRecipe.forEach(item => {
      if (item.itemType === 'product' && item.linkedProductId && !item.selectionGroup && !item.isOptional) {
        // Check if this linked product has XOR groups
        const nestedResult = flattenAllChoices(item.linkedProductId, 1);
        if (nestedResult.xorGroups.length > 0) {
          productsWithNestedXORs.add(item.linkedProductId);
        }
      }
    });

    // Only include mandatory individuals that DON'T have nested XOR groups
    const mandatoryIndividual = rootRecipe.filter(
      item =>
        !item.isOptional &&
        !item.selectionGroup &&
        item.itemType === 'product' &&
        !productsWithNestedXORs.has(item.linkedProductId || '')
    );

    // Determine if modal is needed
    const needsModal = xorGroups.length > 0 || optionalItems.length > 0;

    // Determine if this is a combo product (has linked products, not just materials)
    const hasLinkedProducts = rootRecipe.some(item => item.itemType === 'product');
    const isCombo = hasLinkedProducts;

    console.log(`\n📊 Flattened recipe for modal:`);
    console.log(`  XOR Groups: ${xorGroups.length}`);
    xorGroups.forEach(g => {
      console.log(`    - ${g.displayName} (${g.uniqueKey}): ${g.items.length} items`);
    });
    console.log(`  Optional: ${optionalItems.length}`);
    console.log(`  Mandatory individual: ${mandatoryIndividual.length}`);
    console.log(`  ✅ needsModal: ${needsModal}`);
    console.log(`  🎁 isCombo: ${isCombo}\n`);

    return NextResponse.json({
      success: true,
      product: {
        id: product.wcId,
        localId: product.id,
        name: product.name,
        sku: product.sku,
        basePrice: product.basePrice,
        unitCost: product.unitCost,
        comboPriceOverride: product.comboPriceOverride,
      },
      recipe: {
        // XOR groups from all nesting levels, flattened
        mandatoryGroups: xorGroups.map(group => ({
          uniqueKey: group.uniqueKey,
          groupName: group.displayName, // Use display name for UI
          items: group.items,
        })),
        // Mandatory individual items (root level only, for display)
        mandatoryIndividual: mandatoryIndividual.map((item) => ({
          id: item.linkedProductId || item.materialId,
          type: item.itemType,
          name: item.linkedProductName || item.materialName,
          sku: item.linkedProductSku,
          quantity: item.quantity,
          unit: item.unit,
          cost: item.calculatedCost,
        })),
        // Optional items from all levels
        optional: optionalItems,
      },
      needsModal,
      isCombo, // Flag indicating if this is a combo product
    });
  } catch (error) {
    return handleApiError(error, '/api/products/[productId]/recipe');
  }
}
