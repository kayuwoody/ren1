import { NextResponse } from 'next/server';
import { getAllProducts, setProductAvailableOnline } from '@/lib/db/productService';
import { getBranchStock } from '@/lib/db/branchStockService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const allProducts = getAllProducts();

    const products = allProducts.map(p => ({
      id: p.id,
      name: p.name,
      price: p.basePrice,
      category: p.category,
      available: !!p.availableOnline,
      stock_count: p.manageStock ? getBranchStock('main', 'product', p.id) : null,
    }));

    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { productId, available } = await req.json();

    if (!productId || typeof available !== 'boolean') {
      return NextResponse.json({ error: 'productId and available (boolean) required' }, { status: 400 });
    }

    const updated = setProductAvailableOnline(productId, available);
    if (!updated) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, productId, available });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update availability' }, { status: 500 });
  }
}
