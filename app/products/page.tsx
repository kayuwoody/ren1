"use client";
import React, { useEffect, useState } from "react";
import { useCart } from "@/context/cartContext";

interface Product {
  id: number;
  name: string;
  price: string;
  images: { src: string }[];
}

const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { addToCart } = useCart();

  useEffect(() => {
    fetch("/api/products")
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProducts(data);
        } else {
          setError("API returned non-array data");
          console.error("Invalid response:", data);
        }
      })
      .catch(err => {
        setError("Failed to fetch products");
        console.error("❌ Failed to fetch products:", err);
      });
  }, []);

  if (error) {
    return <p className="p-4 text-red-500">⚠️ {error}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-4">
      {products.map(product => (
        <div
          key={product.id}
          className="border p-2 rounded shadow-sm cursor-pointer"
          onClick={() => addToCart({ productId: product.id, name: product.name, price: parseFloat(product.price), quantity: 1 })}
        >
          <img
            src={product.images[0]?.src || "/placeholder.jpg"}
            alt={product.name}
            className="w-full h-32 object-cover"
          />
          <h3 className="font-bold">{product.name}</h3>
          <p className="text-sm text-gray-600">RM {product.price}</p>
        </div>
      ))}
    </div>
  );
};

export default ProductListPage;
