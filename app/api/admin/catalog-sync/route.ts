import { NextResponse } from 'next/server';
import { syncAllProducts, syncAllRecipes } from '@/lib/catalogSync';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    console.log('Starting full catalog sync to Supabase...');

    const productResult = await syncAllProducts();
    console.log(`Products synced: ${productResult.synced}/${productResult.total}`);

    const recipeResult = await syncAllRecipes();
    console.log(`Recipes synced: ${recipeResult.synced}/${recipeResult.total}`);

    return NextResponse.json({
      success: true,
      products: productResult,
      recipes: recipeResult,
    });
  } catch (err: any) {
    console.error('Catalog sync failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
