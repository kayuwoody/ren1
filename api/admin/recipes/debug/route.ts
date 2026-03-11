import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { getProductRecipe } from '@/lib/db/recipeService';
import { handleApiError } from '@/lib/api/error-handler';

/**
 * GET /api/admin/recipes/debug
 * Debug endpoint to check product and recipe status
 */
export async function GET() {
  try {
    const products = getAllProducts();

    const report = products.map(product => {
      const recipe = getProductRecipe(product.id);

      return {
        wcId: product.wcId,
        localId: product.id,
        name: product.name,
        sku: product.sku,
        hasRecipe: recipe.length > 0,
        recipeItems: recipe.length,
        unitCost: product.unitCost,
        recipeDetails: recipe.map(item => ({
          type: item.itemType,
          name: item.itemType === 'material' ? item.materialName : item.linkedProductName,
          quantity: item.quantity,
          unit: item.unit,
          cost: item.calculatedCost,
        })),
      };
    });

    const stats = {
      totalProducts: products.length,
      productsWithRecipes: report.filter(p => p.hasRecipe).length,
      productsWithoutRecipes: report.filter(p => !p.hasRecipe).length,
    };

    return NextResponse.json({
      stats,
      products: report,
    });
  } catch (error) {
    return handleApiError(error, '/api/admin/recipes/debug');
  }
}
