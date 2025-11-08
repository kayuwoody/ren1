'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cartContext';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Receipt,
  ArrowLeft,
  Package,
  Tag,
  Percent,
  DollarSign,
  Edit2,
  X,
  TrendingUp
} from 'lucide-react';
import Link from 'next/link';

/**
 * Point of Sale (POS) Interface
 *
 * Staff interface for processing in-store orders with discount capabilities
 *
 * Features:
 * - Quick product selection
 * - Discount application (staff only)
 * - Order processing
 * - Receipt printing
 */

export default function POSPage() {
  const router = useRouter();
  const { cartItems, clearCart, updateItemDiscount, removeFromCart } = useCart();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [discountModal, setDiscountModal] = useState<{
    isOpen: boolean;
    itemIndex: number | null;
    productName: string;
    retailPrice: number;
  }>({
    isOpen: false,
    itemIndex: null,
    productName: "",
    retailPrice: 0,
  });
  const [discountType, setDiscountType] = useState<"percent" | "amount" | "override">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [cogsData, setCogsData] = useState<Record<number, { totalCOGS: number; breakdown: any[] }>>({});

  useEffect(() => {
    // Check admin authentication
    const authToken = sessionStorage.getItem('admin_auth');
    if (authToken !== 'authenticated') {
      router.push('/admin');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  // Fetch COGS data for all cart items
  useEffect(() => {
    const fetchCogsForItems = async () => {
      const newCogsData: Record<number, { totalCOGS: number; breakdown: any[] }> = {};

      for (let i = 0; i < cartItems.length; i++) {
        const item = cartItems[i];
        try {
          // Build query params
          const params = new URLSearchParams({
            quantity: item.quantity.toString(),
          });

          // Add bundle selection if present
          if (item.bundle) {
            params.append('selectedMandatory', JSON.stringify(item.bundle.selectedMandatory));
            params.append('selectedOptional', JSON.stringify(item.bundle.selectedOptional));
          }

          const response = await fetch(`/api/products/${item.productId}/cogs?${params}`);
          if (response.ok) {
            const data = await response.json();
            // Use cart item index as key, not productId (bundles share productId)
            newCogsData[i] = data;
          }
        } catch (err) {
          console.error(`Failed to fetch COGS for ${item.name}:`, err);
        }
      }

      setCogsData(newCogsData);
    };

    if (cartItems.length > 0) {
      fetchCogsForItems();
    } else {
      setCogsData({});
    }
  }, [cartItems]);

  // Discount handling functions
  function openDiscountModal(item: any, index: number) {
    setDiscountModal({
      isOpen: true,
      itemIndex: index,
      productName: item.name,
      retailPrice: item.retailPrice,
    });
    setDiscountType("percent");
    setDiscountValue("");
    setDiscountReason(item.discountReason || "");
  }

  function closeDiscountModal() {
    setDiscountModal({
      isOpen: false,
      itemIndex: null,
      productName: "",
      retailPrice: 0,
    });
    setDiscountValue("");
    setDiscountReason("");
  }

  function applyQuickDiscount(index: number, percent: number) {
    updateItemDiscount(index, { type: "percent", value: percent, reason: `${percent}% off` });
  }

  function applyCustomDiscount() {
    if (discountModal.itemIndex === null) return;

    const value = parseFloat(discountValue);
    if (isNaN(value) || value < 0) {
      alert("Please enter a valid discount value");
      return;
    }

    if (discountType === "percent" && value > 100) {
      alert("Percentage discount cannot exceed 100%");
      return;
    }

    if (discountType === "amount" && value > discountModal.retailPrice) {
      alert("Discount amount cannot exceed retail price");
      return;
    }

    if (discountType === "override" && value > discountModal.retailPrice) {
      alert("Override price cannot exceed retail price");
      return;
    }

    updateItemDiscount(
      discountModal.itemIndex,
      { type: discountType, value: value, reason: discountReason || undefined }
    );
    closeDiscountModal();
  }

  function removeDiscount(index: number) {
    updateItemDiscount(index, { type: "percent", value: 0, reason: undefined });
  }

  // Calculate totals
  const retailTotal = cartItems.reduce(
    (sum, item) => sum + item.retailPrice * item.quantity,
    0
  );
  const finalTotal = cartItems.reduce(
    (sum, item) => sum + item.finalPrice * item.quantity,
    0
  );
  const totalDiscount = retailTotal - finalTotal;
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Authenticating...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/admin"
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <div className="flex items-center gap-3">
                <Receipt className="w-8 h-8 text-blue-600" />
                <div>
                  <h1 className="text-2xl font-bold">Point of Sale</h1>
                  <p className="text-sm text-gray-500">Staff POS System</p>
                </div>
              </div>
            </div>

            {/* Cart summary badge */}
            <div className="flex items-center gap-4">
              <div className="bg-blue-50 px-4 py-2 rounded-lg flex items-center gap-3">
                <ShoppingCart className="w-5 h-5 text-blue-600" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900">
                    {totalItems} {totalItems === 1 ? 'item' : 'items'}
                  </p>
                  <p className="text-blue-700">RM {finalTotal.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Actions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Quick Action - Add Products */}
            <Link
              href="/products"
              className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-4 bg-green-100 rounded-lg group-hover:bg-green-200 transition">
                  <Plus className="w-8 h-8 text-green-700" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Add Products</h2>
                  <p className="text-gray-600">Browse menu and add to cart</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Select products from the menu to build the customer's order
              </p>
            </Link>

            {/* Current Order Summary */}
            {cartItems.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="w-6 h-6 text-gray-700" />
                    <h2 className="text-xl font-semibold">Current Order</h2>
                  </div>
                  <button
                    onClick={clearCart}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm font-medium flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear Cart
                  </button>
                </div>

                <div className="divide-y">
                  {cartItems.map((item, index) => {
                    const hasDiscount = item.finalPrice < item.retailPrice;
                    const itemTotal = item.finalPrice * item.quantity;
                    const itemRetailTotal = item.retailPrice * item.quantity;
                    const itemCogs = cogsData[index]?.totalCOGS || 0;
                    const itemProfit = itemTotal - itemCogs;
                    const profitMargin = itemTotal > 0 ? (itemProfit / itemTotal) * 100 : 0;

                    return (
                      <div key={index} className="p-6 space-y-3">
                        {/* Item Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-lg">{item.name}</h3>
                              <button
                                onClick={() => removeFromCart(index)}
                                className="text-red-600 hover:text-red-800"
                                title="Remove item"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <p className="text-sm text-gray-500">
                              Quantity: {item.quantity}
                            </p>

                            {hasDiscount && item.discountReason && (
                              <div className="flex items-center gap-1 mt-1">
                                <Tag className="w-3 h-3 text-green-600" />
                                <span className="text-xs text-green-600">
                                  {item.discountReason}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="text-right">
                            {hasDiscount && (
                              <p className="text-sm text-gray-400 line-through">
                                RM {itemRetailTotal.toFixed(2)}
                              </p>
                            )}
                            <p className={`text-lg font-bold ${
                              hasDiscount ? 'text-green-700' : ''
                            }`}>
                              RM {itemTotal.toFixed(2)}
                            </p>
                            {hasDiscount && (
                              <p className="text-xs text-green-600">
                                Saved RM {(itemRetailTotal - itemTotal).toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* COGS & Margin Info */}
                        {itemCogs > 0 && (
                          <div className="bg-blue-50 rounded-lg p-3 text-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="w-4 h-4 text-blue-600" />
                              <span className="font-medium text-blue-900">Cost & Margin</span>
                            </div>
                            <div className="grid grid-cols-3 gap-3 text-xs">
                              <div>
                                <p className="text-gray-600">COGS</p>
                                <p className="font-semibold text-gray-800">RM {itemCogs.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-gray-600">Profit</p>
                                <p className={`font-semibold ${itemProfit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                  RM {itemProfit.toFixed(2)}
                                </p>
                              </div>
                              <div>
                                <p className="text-gray-600">Margin</p>
                                <p className={`font-semibold ${profitMargin > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                  {profitMargin.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Discount Controls */}
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => applyQuickDiscount(index, 10)}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition"
                          >
                            10% off
                          </button>
                          <button
                            onClick={() => applyQuickDiscount(index, 20)}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition"
                          >
                            20% off
                          </button>
                          <button
                            onClick={() => applyQuickDiscount(index, 50)}
                            className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200 transition"
                          >
                            50% off
                          </button>
                          <button
                            onClick={() => openDiscountModal(item, index)}
                            className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200 transition flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Custom
                          </button>
                          {hasDiscount && (
                            <button
                              onClick={() => removeDiscount(index)}
                              className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-xs font-medium hover:bg-red-200 transition"
                            >
                              Remove discount
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Order Total */}
                <div className="p-6 bg-gray-50 space-y-4">
                  <div className="space-y-2">
                    {totalDiscount > 0 && (
                      <>
                        <div className="flex justify-between text-gray-600">
                          <span>Retail Total:</span>
                          <span className="line-through">RM {retailTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-green-600 font-semibold">
                          <span>Total Discount:</span>
                          <span>-RM {totalDiscount.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between text-2xl font-bold border-t pt-2">
                      <span>Total:</span>
                      <span className="text-green-700">RM {finalTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Proceed to Payment Button */}
                  <button
                    onClick={() => router.push('/payment')}
                    className="w-full bg-green-600 text-white py-4 rounded-lg hover:bg-green-700 transition font-bold text-lg shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
                  >
                    <Receipt className="w-6 h-6" />
                    Proceed to Payment
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {cartItems.length === 0 && (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No items in cart
                </h3>
                <p className="text-gray-500 mb-6">
                  Click "New Order" to start adding products
                </p>
                <Link
                  href="/products"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                >
                  <Plus className="w-5 h-5" />
                  Add Products
                </Link>
              </div>
            )}
          </div>

          {/* Right Column - Quick Stats & Tips */}
          <div className="space-y-4">
            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Receipt className="w-5 h-5 text-gray-600" />
                Order Summary
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Items:</span>
                  <span className="font-semibold">{totalItems}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Retail Total:</span>
                  <span className="font-semibold">RM {retailTotal.toFixed(2)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-green-600">Discounts:</span>
                    <span className="font-semibold text-green-600">
                      -RM {totalDiscount.toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Final Total:</span>
                  <span className="text-green-700">RM {finalTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Staff Tips */}
            <div className="bg-blue-50 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-3">Staff Tips</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Apply discounts at checkout using quick buttons or custom amounts</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Always add a reason when applying discounts for tracking</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Use price override for special combo deals</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Review the order before proceeding to payment</span>
                </li>
              </ul>
            </div>

            {/* Keyboard Shortcuts */}
            <div className="bg-gray-100 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">
                Quick Actions
              </h3>
              <div className="space-y-2 text-xs text-gray-700">
                <div className="flex justify-between">
                  <span>Add Products:</span>
                  <Link href="/products" className="text-blue-600 hover:underline">
                    Browse Menu
                  </Link>
                </div>
                <div className="flex justify-between">
                  <span>Kitchen Display:</span>
                  <Link href="/kitchen" className="text-blue-600 hover:underline">
                    View Orders
                  </Link>
                </div>
                <div className="flex justify-between">
                  <span>Dashboard:</span>
                  <Link href="/admin" className="text-blue-600 hover:underline">
                    Back to Admin
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Discount Modal */}
      {discountModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Custom Discount</h2>
                <p className="text-sm text-gray-600">{discountModal.productName}</p>
                <p className="text-xs text-gray-500">Retail: RM {discountModal.retailPrice.toFixed(2)}</p>
              </div>
              <button
                onClick={closeDiscountModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Discount type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDiscountType("percent")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      discountType === "percent"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <Percent className="w-4 h-4 mx-auto mb-1" />
                    Percent
                  </button>
                  <button
                    onClick={() => setDiscountType("amount")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      discountType === "amount"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <DollarSign className="w-4 h-4 mx-auto mb-1" />
                    Amount
                  </button>
                  <button
                    onClick={() => setDiscountType("override")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      discountType === "override"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <Edit2 className="w-4 h-4 mx-auto mb-1" />
                    Override
                  </button>
                </div>
              </div>

              {/* Discount value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {discountType === "percent" && "Discount Percentage (%)"}
                  {discountType === "amount" && "Discount Amount (RM)"}
                  {discountType === "override" && "New Price (RM)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={discountType === "percent" ? "100" : discountModal.retailPrice}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={
                    discountType === "percent" ? "e.g., 15" :
                    discountType === "amount" ? "e.g., 5.00" :
                    "e.g., 12.00"
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Discount reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="e.g., Member discount, Happy hour, Promo"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Preview */}
              {discountValue && !isNaN(parseFloat(discountValue)) && (
                <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-gray-600 font-medium">Preview:</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Retail Price:</span>
                    <span className="line-through">RM {discountModal.retailPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-green-700">Sale Price:</span>
                    <span className="text-green-700">
                      RM {(() => {
                        const value = parseFloat(discountValue);
                        if (discountType === "percent") {
                          return (discountModal.retailPrice * (1 - value / 100)).toFixed(2);
                        } else if (discountType === "amount") {
                          return (discountModal.retailPrice - value).toFixed(2);
                        } else {
                          return value.toFixed(2);
                        }
                      })()}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={applyCustomDiscount}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-semibold"
                >
                  Apply Discount
                </button>
                <button
                  onClick={closeDiscountModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
