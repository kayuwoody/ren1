// app/api/products/route.ts
import { NextResponse } from "next/server";
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

export const dynamic = "force-dynamic"; // ensures this API route runs fresh each time
console.log("🔑 ENV URL:", process.env.NEXT_PUBLIC_WC_API_URL);
console.log("🔑 KEY:", process.env.WC_CONSUMER_KEY?.slice(0, 5));

const api = new WooCommerceRestApi({
  url: process.env.NEXT_PUBLIC_WC_API_URL || "",
  consumerKey: process.env.WC_CONSUMER_KEY || "",
  consumerSecret: process.env.WC_CONSUMER_SECRET || "",
  version: "wc/v3",
});

/* export async function GET() {
  try {
    const { data } = await api.get("products", {
      per_page: 10, // adjust as needed
    });

    const simplifiedProducts = data.map((product: any) => ({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images?.[0]?.src || "",
      description: product.description || "",
    }));

    return NextResponse.json(simplifiedProducts);
  } catch (error: any) {
    console.error("WooCommerce API error:", error.response?.data || error.message);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
*/
export async function GET() {
  console.log("📦 Calling WooCommerce /products");
  try {
    const { data } = await api.get("products");
    console.log("✅ WooCommerce returned:", data.length, "products");
    return NextResponse.json(data);
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