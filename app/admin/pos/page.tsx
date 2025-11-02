'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/cartContext';
import {
  ShoppingCart,
  Plus,
  CreditCard,
  Trash2,
  Receipt,
  ArrowLeft,
  Package,
  Tag
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
  const { cartItems, clearCart } = useCart();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check admin authentication
    const authToken = sessionStorage.getItem('admin_auth');
    if (authToken !== 'authenticated') {
      router.push('/admin');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

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
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                href="/products"
                className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition group"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-4 bg-green-100 rounded-lg group-hover:bg-green-200 transition">
                    <Plus className="w-8 h-8 text-green-700" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">New Order</h2>
                    <p className="text-gray-600">Add products to cart</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  Browse and select products to start a new order
                </p>
              </Link>

              <Link
                href="/checkout"
                className={`bg-white rounded-lg shadow-lg p-8 transition group ${
                  cartItems.length === 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:shadow-xl'
                }`}
                onClick={(e) => {
                  if (cartItems.length === 0) {
                    e.preventDefault();
                  }
                }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`p-4 rounded-lg transition ${
                    cartItems.length === 0
                      ? 'bg-gray-100'
                      : 'bg-blue-100 group-hover:bg-blue-200'
                  }`}>
                    <CreditCard className={`w-8 h-8 ${
                      cartItems.length === 0 ? 'text-gray-400' : 'text-blue-700'
                    }`} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Checkout</h2>
                    <p className="text-gray-600">Apply discounts & pay</p>
                  </div>
                </div>
                <p className="text-sm text-gray-500">
                  {cartItems.length === 0
                    ? 'Add items to cart first'
                    : 'Review order, apply discounts, and process payment'}
                </p>
              </Link>
            </div>

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
                  {cartItems.map((item) => {
                    const hasDiscount = item.finalPrice < item.retailPrice;
                    const itemTotal = item.finalPrice * item.quantity;
                    const itemRetailTotal = item.retailPrice * item.quantity;

                    return (
                      <div key={item.productId} className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">{item.name}</h3>
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
                      </div>
                    );
                  })}
                </div>

                {/* Order Total */}
                <div className="p-6 bg-gray-50 space-y-2">
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
                  <span>New Order:</span>
                  <Link href="/products" className="text-blue-600 hover:underline">
                    Go to Products
                  </Link>
                </div>
                <div className="flex justify-between">
                  <span>Checkout:</span>
                  <Link
                    href="/checkout"
                    className={cartItems.length > 0 ? "text-blue-600 hover:underline" : "text-gray-400"}
                  >
                    Go to Checkout
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
    </div>
  );
}
