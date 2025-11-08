"use client";

import { useCart } from "@/context/cartContext";
import { useEffect, useState } from "react";
import Image from "next/image";

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
    <div className="min-h-screen bg-white p-4 flex flex-col">
      {/* Header */}
      <div className="mb-4 border-b border-gray-200 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <Image
                src="/mascot.jpg"
                alt="Coffee Oasis Mascot"
                fill
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Coffee Oasis</h1>
              <p className="text-sm text-gray-600">Your Order</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-mono text-gray-800">
              {currentTime.toLocaleTimeString('en-MY', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })}
            </p>
            <p className="text-xs text-gray-600">
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
      <div className="flex-1 mb-4">
        {cartItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center">
              <div className="relative w-32 h-32 mx-auto mb-4">
                <Image
                  src="/mascot.jpg"
                  alt="Coffee Oasis Mascot"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <p className="text-2xl font-light text-gray-600">
                Your cart is empty
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Items will appear here as they are added
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {cartItems.map((item, index) => {
              const itemTotal = item.finalPrice * item.quantity;
              const itemRetailTotal = item.retailPrice * item.quantity;
              const itemDiscount = itemRetailTotal - itemTotal;
              const hasItemDiscount = itemDiscount > 0;

              return (
                <div
                  key={index}
                  className="bg-gray-50 rounded-lg p-2 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all flex flex-col"
                >
                  {/* Quantity Badge */}
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-lg font-bold text-blue-600">
                      {item.quantity}×
                    </span>
                    {hasItemDiscount && (
                      <span className="text-sm">🎉</span>
                    )}
                  </div>

                  {/* Item Name */}
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 line-clamp-2 flex-1 min-h-[2.5rem]">
                    {item.name}
                  </h3>

                  {/* Discount Reason */}
                  {hasItemDiscount && item.discountReason && (
                    <p className="text-[10px] text-green-600 mb-1 line-clamp-1">
                      {item.discountReason}
                    </p>
                  )}

                  {/* Price */}
                  <div className="mt-auto">
                    {hasItemDiscount ? (
                      <>
                        <p className="text-[10px] text-gray-400 line-through">
                          RM {itemRetailTotal.toFixed(2)}
                        </p>
                        <p className="text-sm font-bold text-green-600">
                          RM {itemTotal.toFixed(2)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gray-800">
                        RM {itemTotal.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Total Section */}
      {cartItems.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200 shadow-md">
          <div className="space-y-2">
            {/* Item Count */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Items</span>
              <span className="font-semibold text-gray-800">{totalItems}</span>
            </div>

            {/* Subtotal (if discount) */}
            {hasDiscount && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="line-through text-gray-400">
                  RM {retailTotal.toFixed(2)}
                </span>
              </div>
            )}

            {/* Discount */}
            {hasDiscount && (
              <div className="flex items-center justify-between text-sm text-green-600">
                <span className="flex items-center gap-1">
                  <span className="text-base">🎉</span>
                  Discount
                </span>
                <span className="font-semibold">
                  -RM {totalDiscount.toFixed(2)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-blue-200 my-2"></div>

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-gray-800">TOTAL</span>
              <span className="text-3xl font-bold text-blue-600">
                RM {finalTotal.toFixed(2)}
              </span>
            </div>

            {/* Savings Summary */}
            {hasDiscount && (
              <div className="text-center pt-2">
                <p className="text-sm text-green-600 font-semibold">
                  🎊 You saved RM {totalDiscount.toFixed(2)}!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 text-center">
        <p className="text-xs text-gray-600">
          Thank you for choosing Coffee Oasis! ☕
        </p>
      </div>
    </div>
  );
}
