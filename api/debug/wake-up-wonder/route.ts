import { NextResponse } from 'next/server';
import { getAllProducts } from '@/lib/db/productService';
import { getProductRecipe } from '@/lib/db/recipeService';

export async function GET() {
  try {
    const products = getAllProducts();
    const wakeUpWonder = products.find(p => p.name.toLowerCase().includes('wake'));

    if (!wakeUpWonder) {
      return NextResponse.json({
        error: 'Wake up Wonder not found',
        allProducts: products.map(p => ({ id: p.id, wcId: p.wcId, name: p.name }))
      });
    }

    const recipe = getProductRecipe(wakeUpWonder.id);

    return NextResponse.json({
      product: wakeUpWonder,
      recipe: recipe,
      recipeCount: recipe.length
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
