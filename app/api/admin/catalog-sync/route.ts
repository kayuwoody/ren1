import { NextResponse } from 'next/server';
import {
  syncAllProducts,
  syncAllRecipes,
  flushSyncQueue,
  getSyncQueueCount,
} from '@/lib/catalogSync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pendingCount = getSyncQueueCount();
    return NextResponse.json({ pendingSync: pendingCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'flush') {
      const processed = await flushSyncQueue();
      return NextResponse.json({ success: true, processed });
    }

    console.log('Starting full catalog sync to Supabase...');

    const productResult = await syncAllProducts();
    console.log(`Products synced: ${productResult.synced}/${productResult.total}`);

    const recipeResult = await syncAllRecipes();
    console.log(`Recipes synced: ${recipeResult.synced}/${recipeResult.total}`);

    const queueProcessed = await flushSyncQueue();

    return NextResponse.json({
      success: true,
      products: productResult,
      recipes: recipeResult,
      queueProcessed,
    });
  } catch (err: any) {
    console.error('Catalog sync failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
