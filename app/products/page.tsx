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
    <div className="max-w-4xl mx-auto p-4">
      {/* Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(product => (
          <div
            key={product.id}
            className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => addToCart({ productId: product.id, name: product.name, price: parseFloat(product.price), quantity: 1 })}
          >
            {/* Image container with aspect ratio */}
            <div className="relative w-full aspect-square bg-gray-100">
              <img
                src={product.images[0]?.src || "/placeholder.jpg"}
                alt={product.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>

            {/* Product info */}
            <div className="p-3">
              <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{product.name}</h3>
              <p className="text-lg font-bold text-green-700">RM {parseFloat(product.price).toFixed(2)}</p>
              <button className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded transition-colors">
                Add to Cart
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductListPage;
