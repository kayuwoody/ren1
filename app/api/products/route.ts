// app/api/products/route.ts
import { NextResponse } from "next/server";
import { fetchAllWooPages } from "@/lib/api/woocommerce-helpers";

export const dynamic = "force-dynamic"; // ensures this API route runs fresh each time

export async function GET() {
  console.log("📦 Calling WooCommerce /products");
  try {
    // Fetch all products (using pagination helper to get ALL products)
    const products = await fetchAllWooPages("products");
    console.log("✅ WooCommerce returned:", products.length, "products");
    return NextResponse.json(products);
  } catch (error: any) {
    console.error("❌ WooCommerce fetch failed");

    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Message:", error.message);
    }

    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}