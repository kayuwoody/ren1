// app/products/[id]/page.tsx
import { notFound } from "next/navigation";
import { getProductById } from "@/lib/woocommerce";
import { AddToCartButton } from "@/components/AddToCartButton";

export default async function ProductDetail({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);

  if (!product) return notFound();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">{product.name}</h1>
      <img src={product.images[0]?.src} alt={product.name} className="w-full rounded-lg mb-4" />
      <p className="text-gray-700 mb-4" dangerouslySetInnerHTML={{ __html: product.description }} />
      <p className="text-xl font-semibold mb-4">RM {product.price}</p>
      <AddToCartButton product={product} />
    </div>
  );
}
