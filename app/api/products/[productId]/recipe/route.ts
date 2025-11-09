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

    // Also get mandatory individual items at root level (for display purposes)
    const rootRecipe = getProductRecipe(product.id);
    const mandatoryIndividual = rootRecipe.filter(
      item => !item.isOptional && !item.selectionGroup && item.itemType === 'product'
    );

    // Determine if modal is needed
    const needsModal = xorGroups.length > 0 || optionalItems.length > 0;

    console.log(`\n📊 Flattened recipe for modal:`);
    console.log(`  XOR Groups: ${xorGroups.length}`);
    xorGroups.forEach(g => {
      console.log(`    - ${g.displayName} (${g.uniqueKey}): ${g.items.length} items`);
    });
    console.log(`  Optional: ${optionalItems.length}`);
    console.log(`  Mandatory individual: ${mandatoryIndividual.length}`);
    console.log(`  ✅ needsModal: ${needsModal}\n`);

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
    });
  } catch (error) {
    return handleApiError(error, '/api/products/[productId]/recipe');
  }
}
