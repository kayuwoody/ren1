import { NextResponse } from 'next/server';
import { getProduct } from '@/lib/db/productService';
import { getProductRecipe } from '@/lib/db/recipeService';
import { flattenAllChoices } from '@/lib/db/recursiveProductExpansion';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get('productId');

  if (!productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 });
  }

  const product = getProduct(productId);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const recipe = getProductRecipe(productId);
  const { xorGroups, optionalItems } = flattenAllChoices(productId);

  return NextResponse.json({
    product: { id: product.id, name: product.name, comboPriceOverride: product.comboPriceOverride },
    rawRecipe: recipe.map(r => ({
      id: r.id,
      itemType: r.itemType,
      linkedProductId: r.linkedProductId,
      linkedProductName: r.linkedProductName,
      selectionGroup: r.selectionGroup,
      isOptional: r.isOptional,
      priceAdjustment: r.priceAdjustment,
    })),
    selectionConfig: { xorGroups, optionalItems },
    summary: {
      recipeItemCount: recipe.length,
      xorGroupCount: xorGroups.length,
      xorGroups: xorGroups.map(g => ({
        key: g.uniqueKey,
        name: g.displayName,
        parentProductId: g.parentProductId,
        itemCount: g.items.length,
        items: g.items.map(i => i.name),
      })),
      optionalItemCount: optionalItems.length,
      optionalItems: optionalItems.map(i => i.name),
    },
  });
}
