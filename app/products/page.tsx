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
  categories: { id: number; name: string; slug: string }[];
  stock_quantity: number | null;
  manage_stock: boolean;
}

interface RecipeData {
  product: any;
  recipe: any;
  needsModal: boolean;
  isCombo: boolean;
}

const ProductListPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isStaffMode, setIsStaffMode] = useState(false);
  const [modalData, setModalData] = useState<RecipeData | null>(null);
  const [loadingRecipe, setLoadingRecipe] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showInStockOnly, setShowInStockOnly] = useState(false);
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
      console.log(`🔍 Fetching recipe for "${product.name}" (WC ID: ${product.id})`);
      const response = await fetch(`/api/products/${product.id}/recipe`);
      const data = await response.json();

      console.log(`📋 Recipe response:`, {
        success: data.success,
        needsModal: data.needsModal,
        mandatoryGroups: data.recipe?.mandatoryGroups?.length || 0,
        optional: data.recipe?.optional?.length || 0,
        mandatoryIndividual: data.recipe?.mandatoryIndividual?.length || 0,
      });

      if (data.success && data.needsModal) {
        // Product has mandatory selections or optional add-ons - show modal
        console.log(`✅ Showing modal for "${product.name}"`);
        // Check if product is a combo (has 'combo' category)
        const isCombo = (product.categories || []).some(cat => cat.slug === 'combo');
        setModalData({ ...data, isCombo });
      } else {
        // Simple product - add directly to cart
        console.log(`➡️  Adding "${product.name}" directly to cart (no modal needed)`);
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

  const handleModalAddToCart = async (bundle: any) => {
    // Add bundle to cart
    console.log(`🛒 Adding to cart:`, {
      displayName: bundle.displayName,
      baseProductId: bundle.baseProduct.id,
      isCombo: bundle.isCombo,
      selectedMandatory: bundle.selectedMandatory,
      selectedOptional: bundle.selectedOptional,
    });

    // Only fetch components for combo products (not regular products with variants)
    let components: Array<{ productId: string; productName: string; quantity: number; category: string }> = [];
    if (bundle.isCombo) {
      try {
        console.log(`📦 Fetching bundle components for ${bundle.displayName}...`);
        const response = await fetch('/api/bundles/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wcProductId: bundle.baseProduct.id,
            bundleSelection: {
              selectedMandatory: bundle.selectedMandatory,
              selectedOptional: bundle.selectedOptional,
            },
            quantity: 1,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          components = data.components || [];
          console.log(`✅ Fetched ${components.length} components:`, components);
        } else {
          console.warn(`⚠️ Failed to fetch components: ${response.status}`);
        }
      } catch (err) {
        console.error(`❌ Error fetching bundle components:`, err);
      }
    } else {
      console.log(`➡️  Not a combo - skipping component fetch`);
    }

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
      components, // Store components in cart item (only for combos)
    });

    setToast(`Added ${bundle.displayName} to cart`);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    // Always force sync on page load to get fresh stock levels
    const apiUrl = "/api/products?force_sync=true";

    console.log(`🔍 Fetching products with fresh stock data...`);

    fetch(apiUrl)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          console.log(`✅ Received ${data.length} products from API`);
          console.log('📊 Sample product:', data[0]);
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

  // Extract unique categories with proper names
  const categories = Array.from(
    new Set(
      products.flatMap(p => (p.categories || []).map(c => ({ slug: c.slug, name: c.name })))
    )
  ).reduce((acc, cat) => {
    if (!acc.find(c => c.slug === cat.slug)) {
      acc.push(cat);
    }
    return acc;
  }, [] as { slug: string; name: string }[])
  .sort((a, b) => a.name.localeCompare(b.name));

  // Filter products based on selected filters
  const filteredProducts = products
    .filter(product => {
      // Category filter
      const categoryMatch = selectedCategory === "all" ||
        (product.categories || []).some(cat => cat.slug === selectedCategory);

      // Stock filter
      const stockMatch = !showInStockOnly ||
        (product.manage_stock ? (product.stock_quantity ?? 0) > 0 : true);

      return categoryMatch && stockMatch;
    })
    .sort((a, b) => {
      // Sort by category name, then by product name
      const aCat = (a.categories || [])[0]?.name || 'zzz';
      const bCat = (b.categories || [])[0]?.name || 'zzz';
      if (aCat !== bCat) {
        return aCat.localeCompare(bCat);
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="w-full p-4">
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

      <h1 className="text-2xl font-bold mb-4">Menu</h1>

      {/* Horizontal Category Filter */}
      <div className="mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition ${
              selectedCategory === "all"
                ? "bg-green-600 text-white shadow-md"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            All Items
          </button>
          {categories.map(category => (
            <button
              key={category.slug}
              onClick={() => setSelectedCategory(category.slug)}
              className={`px-4 py-2 rounded-full font-medium whitespace-nowrap transition ${
                selectedCategory === category.slug
                  ? "bg-green-600 text-white shadow-md"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </div>

      {/* Secondary Filters */}
      <div className="mb-6 flex items-center justify-between">
        {/* Stock Filter */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showInStockOnly}
            onChange={(e) => setShowInStockOnly(e.target.checked)}
            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
          />
          <span className="text-sm font-medium text-gray-700">In Stock Only</span>
        </label>

        {/* Results count */}
        <p className="text-sm text-gray-600">
          {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Responsive auto-fill grid - naturally adjusts to screen size */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {filteredProducts.map(product => {
          const isOutOfStock = product.manage_stock && (product.stock_quantity ?? 0) === 0;
          return (
          <div
            key={product.id}
            className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden transition-shadow ${
              isOutOfStock ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
            }`}
            onClick={() => !isOutOfStock && handleAddToCart(product)}
          >
            {/* Image container with aspect ratio */}
            <div className="relative w-full aspect-square bg-gray-100">
              <img
                src={product.images[0]?.src || "/placeholder.svg"}
                alt={product.name}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Stock status badge */}
              {product.manage_stock && (
                <div className="absolute top-2 right-2">
                  {(product.stock_quantity ?? 0) === 0 ? (
                    <span className="px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded">
                      Out of Stock
                    </span>
                  ) : (product.stock_quantity ?? 0) < 10 ? (
                    <span className="px-2 py-1 bg-yellow-500 text-white text-xs font-semibold rounded">
                      Low Stock ({product.stock_quantity})
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Product info */}
            <div className="p-3">
              <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{product.name}</h3>
              {/* Category tag */}
              {product.categories && product.categories.length > 0 && (
                <p className="text-xs text-gray-500 mb-1">
                  {product.categories[0].name}
                </p>
              )}
              {/* Stock quantity - only show for products that track inventory */}
              {product.manage_stock && product.stock_quantity !== null && product.stock_quantity !== undefined && (
                <p className="text-xs text-gray-600 mb-1">
                  Stock: <span className={`font-semibold ${
                    product.stock_quantity === 0 ? 'text-red-600' :
                    product.stock_quantity < 10 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>{product.stock_quantity}</span>
                </p>
              )}
              <p className="text-lg font-bold text-green-700">RM {parseFloat(product.price).toFixed(2)}</p>
              <button
                className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                disabled={product.manage_stock && (product.stock_quantity ?? 0) === 0}
              >
                {product.manage_stock && (product.stock_quantity ?? 0) === 0 ? 'Out of Stock' : 'Add to Cart'}
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {/* Product Selection Modal */}
      {modalData && (
        <ProductSelectionModal
          isOpen={true}
          onClose={() => setModalData(null)}
          product={modalData.product}
          recipe={modalData.recipe}
          isCombo={modalData.isCombo}
          onAddToCart={handleModalAddToCart}
        />
      )}
    </div>
  );
};

export default ProductListPage;
