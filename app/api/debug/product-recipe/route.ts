import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { getProductRecipe } from '@/lib/db/recipeService';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || 'wake';

    const products = getAllProducts();
    const matchingProducts = products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    const results = matchingProducts.map(product => {
      const recipe = getProductRecipe(product.id);
      return {
        product: {
          id: product.id,
          wcId: product.wcId,
          name: product.name,
          sku: product.sku,
          basePrice: product.basePrice,
        },
        recipe: recipe.map(r => ({
          itemType: r.itemType,
          linkedProductId: r.linkedProductId,
          linkedProductName: r.linkedProductName,
          materialId: r.materialId,
          materialName: r.materialName,
          quantity: r.quantity,
          unit: r.unit,
          isOptional: r.isOptional,
          selectionGroup: r.selectionGroup,
        })),
        recipeCount: recipe.length,
      };
    });

    return NextResponse.json({
      search,
      found: results.length,
      products: results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
