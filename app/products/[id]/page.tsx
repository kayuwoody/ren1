import { getProductById } from "@/lib/woocommerce";
import { useCart } from "@/context/cartContext";
import Image from "next/image";
import Link from "next/link";

export default async function ProductDetail({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);
  if (!product) return <div>Product not found</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <Image src={product.images?.[0]?.src} alt={product.name} width={500} height={500} className="rounded mb-4" />
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-gray-600 mt-2 mb-4">{product.price} MYR</p>
      <form action="/cart" method="POST">
        <input type="hidden" name="id" value={product.id} />
        <button className="px-4 py-2 bg-blue-600 text-white rounded">Add to Cart</button>
      </form>
      <Link href="/products" className="block mt-4 text-blue-500 underline">Back to Products</Link>
    </div>
  );
}