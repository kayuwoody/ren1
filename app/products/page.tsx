"use client";
import React, { useEffect, useState } from "react";
import { useCart } from "@/context/cartContext";
import { Shield } from "lucide-react";
import Link from "next/link";
import ProductSelectionModal from "@/components/ProductSelectionModal";

interface Product {
  id: number;
  name: string;
  price: string;
  images: { src: string }[];
}

interface RecipeData {
  product: any;
  recipe: any;
  needsModal: boolean;
}

const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isStaffMode, setIsStaffMode] = useState(false);
  const [modalData, setModalData] = useState<RecipeData | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const { addToCart, cartItems } = useCart();

  // Check if staff is logged in
  useEffect(() => {
    const authToken = sessionStorage.getItem('admin_auth');
    setIsStaffMode(authToken === 'authenticated');
  }, []);

  const handleAddToCart = async (product: Product) => {
    setLoadingRecipe(true);

    try {
      // Fetch recipe configuration
      const response = await fetch(`/api/products/${product.id}/recipe`);
      const data = await response.json();

      if (data.success && data.needsModal) {
        // Product has mandatory selections or optional add-ons - show modal
        setModalData(data);
      } else {
        // Simple product - add directly to cart
        addToCart({
          productId: product.id,
          name: product.name,
          retailPrice: parseFloat(product.price),
          quantity: 1
        });

        setToast(`Added ${product.name} to cart`);
        setTimeout(() => setToast(null), 2000);
      }
    } catch (error) {
      console.error('Error fetching recipe:', error);
      // Fallback: add as simple product
      addToCart({
        productId: product.id,
        name: product.name,
        retailPrice: parseFloat(product.price),
        quantity: 1
      });

      setToast(`Added ${product.name} to cart`);
      setTimeout(() => setToast(null), 2000);
    } finally {
      setLoadingRecipe(false);
    }
  };

  const handleModalAddToCart = (bundle: any) => {
    // Add bundle to cart
    addToCart({
      productId: bundle.baseProduct.id,
      name: bundle.displayName,
      retailPrice: bundle.totalPrice,
      quantity: 1,
      bundle: {
        baseProductId: bundle.baseProduct.id,
        baseProductName: bundle.baseProduct.name,
        selectedMandatory: bundle.selectedMandatory,
        selectedOptional: bundle.selectedOptional,
      },
    });

    setToast(`Added ${bundle.displayName} to cart`);
    setTimeout(() => setToast(null), 2000);
  };

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

  const cartTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const cartQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 pb-24">
      {/* Staff Mode Banner */}
      {isStaffMode && (
        <div className="mb-6 bg-blue-600 text-white rounded-lg p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6" />
              <div>
                <p className="font-semibold">Staff Mode Active</p>
                <p className="text-sm text-blue-100">Discounts can be applied at checkout</p>
              </div>
            </div>
            <Link
              href="/admin/pos"
              className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition font-medium text-sm"
            >
              Back to POS
            </Link>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce">
          ✓ {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6">Menu</h1>

      {/* Responsive grid: 1 col mobile, 2 cols tablet, 3 cols desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map(product => (
          <div
            key={product.id}
            className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => handleAddToCart(product)}
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

      {/* Floating cart summary - only show when items in cart */}
      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-40">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">{cartQuantity} item{cartQuantity > 1 ? 's' : ''} in cart</p>
              <p className="text-lg font-bold">RM {cartTotal.toFixed(2)}</p>
            </div>
            <a
              href="/checkout"
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition"
            >
              View Cart & Checkout
            </a>
          </div>
        </div>
      )}

      {/* Product Selection Modal */}
      {modalData && (
        <ProductSelectionModal
          isOpen={true}
          onClose={() => setModalData(null)}
          product={modalData.product}
          recipe={modalData.recipe}
          onAddToCart={handleModalAddToCart}
        />
      )}
    </div>
  );
};

export default ProductListPage;
