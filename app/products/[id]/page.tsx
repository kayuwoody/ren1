import { getProductByWcId } from "@/lib/db/productService";
import Image from "next/image";
import Link from "next/link";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getProductByWcId(Number(id));
  if (!product) return <div>Product not found</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {product.imageUrl && (
        <Image src={product.imageUrl} alt={product.name} width={500} height={500} className="rounded mb-4" />
      )}
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-gray-600 mt-2 mb-4">{product.basePrice} MYR</p>
      <form action="/cart" method="POST">
        <input type="hidden" name="id" value={String(product.wcId)} />
        <button className="px-4 py-2 bg-blue-600 text-white rounded">Add to Cart</button>
      </form>
      <Link href="/products" className="block mt-4 text-blue-500 underline">Back to Products</Link>
    </div>
  );
}
