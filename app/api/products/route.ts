// app/api/products/route.ts
import { NextResponse } from "next/server";
import { fetchAllWooPages } from "@/lib/api/woocommerce-helpers";
import { handleApiError } from "@/lib/api/error-handler";

export const dynamic = "force-dynamic"; // ensures this API route runs fresh each time

export async function GET() {
  console.log("📦 Calling WooCommerce /products");
  try {
    // Fetch all products (using pagination helper to get ALL products)
    const products = await fetchAllWooPages("products");
    console.log("✅ WooCommerce returned:", products.length, "products");
    return NextResponse.json(products);
  } catch (error) {
    return handleApiError(error, "/api/products");
  }
}