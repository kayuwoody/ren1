"use client";

import { useCart } from "@/context/cartContext";
import { useEffect, useState } from "react";

export default function CustomerDisplayPage() {
  const { cartItems } = useCart();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate totals
  const retailTotal = cartItems.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0);
  const finalTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const totalDiscount = retailTotal - finalTotal;
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const hasDiscount = totalDiscount > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 text-white p-8 flex flex-col">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-5xl font-bold mb-2">☕ Coffee Oasis</h1>
            <p className="text-2xl text-purple-200">Your Order</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-mono">
              {currentTime.toLocaleTimeString('en-MY', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })}
            </p>
            <p className="text-lg text-purple-200">
              {currentTime.toLocaleDateString('en-MY', {
                weekday: 'long',
                day: 'numeric',
                month: 'long'
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 mb-8">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center">
              <p className="text-8xl mb-6">🛒</p>
              <p className="text-4xl font-light text-purple-200">
                Your cart is empty
              </p>
              <p className="text-2xl text-purple-300 mt-4">
                Items will appear here as they are added
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {cartItems.map((item, index) => {
              const itemTotal = item.finalPrice * item.quantity;
              const itemRetailTotal = item.retailPrice * item.quantity;
              const itemDiscount = itemRetailTotal - itemTotal;
              const hasItemDiscount = itemDiscount > 0;

              return (
                <div
                  key={index}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 border-white/20 hover:bg-white/15 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Item Details */}
                    <div className="flex-1">
                      <div className="flex items-baseline gap-3">
                        <span className="text-4xl font-bold text-yellow-300">
                          {item.quantity}×
                        </span>
                        <h3 className="text-3xl font-semibold">{item.name}</h3>
                      </div>

                      {/* Discount Reason */}
                      {hasItemDiscount && item.discountReason && (
                        <p className="text-lg text-green-300 mt-2 flex items-center gap-2">
                          <span className="text-2xl">🎉</span>
                          {item.discountReason}
                        </p>
                      )}
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      {hasItemDiscount ? (
                        <>
                          <p className="text-2xl text-purple-300 line-through">
                            RM {itemRetailTotal.toFixed(2)}
                          </p>
                          <p className="text-4xl font-bold text-green-300">
                            RM {itemTotal.toFixed(2)}
                          </p>
                          <p className="text-lg text-green-400">
                            Save RM {itemDiscount.toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <p className="text-4xl font-bold">
                          RM {itemTotal.toFixed(2)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Total Section */}
      {cartItems.length > 0 && (
        <div className="bg-white/20 backdrop-blur-md rounded-3xl p-8 border-2 border-white/30">
          <div className="space-y-4">
            {/* Item Count */}
            <div className="flex items-center justify-between text-2xl">
              <span className="text-purple-200">Total Items</span>
              <span className="font-semibold">{totalItems}</span>
            </div>

            {/* Subtotal (if discount) */}
            {hasDiscount && (
              <div className="flex items-center justify-between text-2xl">
                <span className="text-purple-200">Subtotal</span>
                <span className="line-through text-purple-300">
                  RM {retailTotal.toFixed(2)}
                </span>
              </div>
            )}

            {/* Discount */}
            {hasDiscount && (
              <div className="flex items-center justify-between text-2xl text-green-300">
                <span className="flex items-center gap-2">
                  <span className="text-3xl">🎉</span>
                  Discount
                </span>
                <span className="font-semibold">
                  -RM {totalDiscount.toFixed(2)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t-2 border-white/30 my-4"></div>

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-4xl font-bold">TOTAL</span>
              <span className="text-6xl font-bold text-yellow-300">
                RM {finalTotal.toFixed(2)}
              </span>
            </div>

            {/* Savings Summary */}
            {hasDiscount && (
              <div className="text-center pt-4">
                <p className="text-2xl text-green-300 font-semibold">
                  🎊 You saved RM {totalDiscount.toFixed(2)} today!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-xl text-purple-200">
          Thank you for choosing Coffee Oasis! ☕
        </p>
      </div>
    </div>
  );
}
