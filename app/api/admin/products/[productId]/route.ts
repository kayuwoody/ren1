import { NextResponse } from 'next/server';
import { getProduct, upsertProduct, deleteProduct, getProductBySku } from '@/lib/db/productService';
import { handleApiError, notFoundError } from '@/lib/api/error-handler';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const product = getProduct(productId);
    if (!product) {
      return notFoundError(`Product not found: ${productId}`, '/api/admin/products/[productId]');
    }
    return NextResponse.json({ product });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]');
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const existing = getProduct(productId);
    if (!existing) {
      return notFoundError(`Product not found: ${productId}`, '/api/admin/products/[productId]');
    }

    const body = await req.json();
    const { name, sku, category, basePrice, manageStock, imageUrl, supplier, quantityPerCarton } = body;

    if (!name || !sku || !category) {
      return NextResponse.json({ error: 'name, sku, and category are required' }, { status: 400 });
    }

    if (sku !== existing.sku) {
      const skuConflict = getProductBySku(sku);
      if (skuConflict && skuConflict.id !== productId) {
        return NextResponse.json({ error: `A product with SKU "${sku}" already exists` }, { status: 409 });
      }
    }

    const product = upsertProduct({
      id: productId,
      wcId: existing.wcId,
      name,
      sku,
      category,
      basePrice: parseFloat(basePrice) || 0,
      supplierCost: existing.supplierCost,
      unitCost: existing.unitCost,
      stockQuantity: existing.stockQuantity,
      manageStock: manageStock ?? existing.manageStock,
      imageUrl: imageUrl || undefined,
      supplier: supplier || undefined,
      quantityPerCarton: quantityPerCarton || undefined,
    });

    return NextResponse.json({ product });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]');
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const existing = getProduct(productId);
    if (!existing) {
      return notFoundError(`Product not found: ${productId}`, '/api/admin/products/[productId]');
    }

    try {
      deleteProduct(productId);
    } catch (err: any) {
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return NextResponse.json(
          { error: 'Cannot delete product: it has recipes or order history. Remove those first.' },
          { status: 409 }
        );
      }
      throw err;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '/api/admin/products/[productId]');
  }
}
