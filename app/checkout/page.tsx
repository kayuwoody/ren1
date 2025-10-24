"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, removeFromCart } = useCart();
  const [error, setError] = useState("");

  // Calculate total
  const total = cartItems.reduce(
    (sum: number, i: any) => sum + (i.price ?? 0) * (i.quantity ?? 0),
    0
  );

  function handleConfirm() {
    if (!cartItems.length) {
      setError("Your cart is empty.");
      return;
    }

    console.log("🛒 Proceeding to payment with cart items:", cartItems);

    // Navigate to payment page (cart stays intact)
    router.push("/payment");
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {cartItems.length === 0 ? (
        <p className="text-gray-600">Your cart is empty.</p>
      ) : (
        <>
          {/* Cart summary with remove buttons */}
          <ul className="mb-4 space-y-2">
            {cartItems.map((item: any) => (
              <li key={item.productId} className="flex justify-between items-center border-b pb-2">
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">Quantity: {item.quantity}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">
                    RM {((item.price ?? 0) * (item.quantity ?? 0)).toFixed(2)}
                  </span>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <p className="text-right font-semibold">
            Total: RM {total.toFixed(2)}
          </p>

          <button
            onClick={handleConfirm}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
          >
            Proceed to Payment
          </button>

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

          <p className="text-xs text-gray-500 text-center">
            Review your order and simulate payment on the next screen
          </p>
        </>
      )}
    </div>
  );
}
