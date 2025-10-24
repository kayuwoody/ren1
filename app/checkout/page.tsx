"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { getGuestId } from "@/lib/getGuestId";

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, clearCart, removeFromCart } = useCart();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Calculate total
  const total = cartItems.reduce(
    (sum: number, i: any) => sum + (i.price ?? 0) * (i.quantity ?? 0),
    0
  );

  async function handleConfirm() {
    setError("");
    setLoading(true);

    if (!cartItems.length) {
      setError("Your cart is empty.");
      setLoading(false);
      return;
    }

    console.log("🛒 Creating order with cart items:", cartItems);

    // Get user info
    const userIdStr =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    const userId = userIdStr ? Number(userIdStr) : undefined;
    const guestId = userId ? undefined : getGuestId();

    // Build line items payload
    const lineItems = cartItems.map((i: any) => ({
      product_id: i.productId,
      quantity: i.quantity,
    }));

    try {
      // Create order with all cart items
      const payload: any = {
        line_items: lineItems,
        ...(userId ? { userId } : { guestId }),
      };

      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Create order failed:", text);
        setError("Order failed. Please try again.");
        setLoading(false);
        return;
      }

      const order = await res.json();
      console.log("✅ Created order:", order.id, "with", order.line_items.length, "items");

      // Clear cart now that order is created
      clearCart();

      // Navigate to payment page
      router.push(`/orders/${order.id}`);
    } catch (err) {
      console.error("Order error:", err);
      setError("Network error. Please try again.");
      setLoading(false);
    }
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
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? 'Creating Order...' : 'Confirm & Pay'}
          </button>

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

          <p className="text-xs text-gray-500 text-center">
            You'll be able to simulate payment on the next screen
          </p>
        </>
      )}
    </div>
  );
}
