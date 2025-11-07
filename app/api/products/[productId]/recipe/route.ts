import { NextResponse } from 'next/server';
import { getProduct, getProductByWcId } from '@/lib/db/productService';
import { getProductRecipe } from '@/lib/db/recipeService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

/**
 * GET /api/products/[productId]/recipe
 *
 * Fetch a product's recipe configuration including:
 * - Mandatory items (must be selected)
 * - Optional items (can be added)
 * - Selection groups (XOR choices - e.g., Hot vs Iced)
 *
 * Used by product selection UI to determine if a modal is needed
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

    // Get recipe
    const recipe = getProductRecipe(product.id);

    console.log(`\n🔍 Product: ${product.name} (${product.id})`);
    console.log(`📋 Recipe items found: ${recipe.length}`);
    recipe.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.itemType}: ${item.linkedProductName || item.materialName} | Optional: ${item.isOptional} | SelectionGroup: ${item.selectionGroup || 'none'}`);
    });

    // Group items by type and selection group
    const mandatoryGroups: Record<string, typeof recipe> = {};
    const mandatoryIndividual: typeof recipe = [];
    const optional: typeof recipe = [];

    recipe.forEach((item) => {
      if (item.isOptional) {
        optional.push(item);
      } else if (item.selectionGroup) {
        // Mandatory item with selection group (XOR choice)
        if (!mandatoryGroups[item.selectionGroup]) {
          mandatoryGroups[item.selectionGroup] = [];
        }
        mandatoryGroups[item.selectionGroup].push(item);
      } else {
        // Mandatory item without selection group (always included)
        mandatoryIndividual.push(item);
      }
    });

    // Determine if modal is needed
    const needsModal =
      Object.keys(mandatoryGroups).length > 0 || optional.length > 0;

    console.log(`\n📊 Grouping results:`);
    console.log(`  Mandatory groups: ${Object.keys(mandatoryGroups).length}`);
    Object.entries(mandatoryGroups).forEach(([groupName, items]) => {
      console.log(`    - ${groupName}: ${items.length} items`);
    });
    console.log(`  Mandatory individual: ${mandatoryIndividual.length}`);
    console.log(`  Optional: ${optional.length}`);
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
      },
      recipe: {
        mandatoryGroups: Object.entries(mandatoryGroups).map(
          ([groupName, items]) => ({
            groupName,
            items: items.map((item) => {
              let priceAdjustment = 0;
              // For linked products, get their basePrice
              if (item.itemType === 'product' && item.linkedProductId) {
                const linkedProd = getProduct(item.linkedProductId);
                if (linkedProd) {
                  priceAdjustment = linkedProd.basePrice * item.quantity;
                }
              }
              return {
                id: item.linkedProductId || item.materialId,
                type: item.itemType,
                name: item.linkedProductName || item.materialName,
                sku: item.linkedProductSku,
                quantity: item.quantity,
                unit: item.unit,
                cost: item.calculatedCost,
                priceAdjustment,
              };
            }),
          })
        ),
        mandatoryIndividual: mandatoryIndividual.map((item) => ({
          id: item.linkedProductId || item.materialId,
          type: item.itemType,
          name: item.linkedProductName || item.materialName,
          sku: item.linkedProductSku,
          quantity: item.quantity,
          unit: item.unit,
          cost: item.calculatedCost,
        })),
        optional: optional.map((item) => {
          let priceAdjustment = 0;
          // For linked products, get their basePrice
          if (item.itemType === 'product' && item.linkedProductId) {
            const linkedProd = getProduct(item.linkedProductId);
            if (linkedProd) {
              priceAdjustment = linkedProd.basePrice * item.quantity;
            }
          }
          return {
            id: item.linkedProductId || item.materialId,
            type: item.itemType,
            name: item.linkedProductName || item.materialName,
            sku: item.linkedProductSku,
            quantity: item.quantity,
            unit: item.unit,
            cost: item.calculatedCost,
            priceAdjustment,
          };
        }),
      },
      needsModal,
    });
  } catch (error) {
    return handleApiError(error, '/api/products/[productId]/recipe');
  }
}
