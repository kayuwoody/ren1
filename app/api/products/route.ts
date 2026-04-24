import { NextResponse } from "next/server";
import { getAllProducts } from "@/lib/db/productService";
import { getBranchIdFromRequest } from "@/lib/api/branchHelper";
import { getBranchStock } from "@/lib/db/branchStockService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const branchId = getBranchIdFromRequest(req);

  try {
    const localProducts = getAllProducts();

    const visibleProducts = localProducts.filter(
      product => product.category !== 'hidden' && product.category !== 'private'
    );

    const products = visibleProducts.map(product => ({
      id: product.id,
      wcId: product.wcId,
      name: product.name,
      sku: product.sku,
      price: product.basePrice.toString(),
      regular_price: product.basePrice.toString(),
      stock_quantity: getBranchStock(branchId, 'product', product.id),
      manage_stock: product.manageStock,
      images: product.imageUrl ? [{ src: product.imageUrl }] : [],
      categories: [{ slug: product.category, name: product.category }],
    }));

    return NextResponse.json(products);
  } catch (error: any) {
    console.error("❌ Products fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
