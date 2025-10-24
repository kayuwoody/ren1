"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { getGuestId } from "@/lib/getGuestId";

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, clearCart, removeFromCart, syncWithPendingOrder } = useCart();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<any>(null);

  // Check for existing pending order
  useEffect(() => {
    const checkPendingOrder = async () => {
      const pendingOrderId = localStorage.getItem("pendingOrderId");
      if (pendingOrderId) {
        try {
          const res = await fetch(`/api/orders/${pendingOrderId}`);
          if (res.ok) {
            const order = await res.json();
            // Only keep it if still pending
            if (order.status === 'pending') {
              setPendingOrder(order);
            } else {
              // Order was paid, clear it
              localStorage.removeItem("pendingOrderId");
            }
          } else {
            // Order doesn't exist, clear it
            localStorage.removeItem("pendingOrderId");
          }
        } catch (err) {
          console.error('Failed to check pending order:', err);
        }
      }
    };

    checkPendingOrder();
  }, []);

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

    console.log("🛒 Starting checkout with cart items:", cartItems);

    try {
      // First, ensure cart is synced to pending order
      await syncWithPendingOrder();
      console.log("✅ Cart synced before checkout");

      // Wait a moment for sync to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Now get the pending order ID
      const pendingOrderId = localStorage.getItem("pendingOrderId");

      if (!pendingOrderId) {
        setError("Failed to create order. Please try again.");
        setLoading(false);
        return;
      }

      // Fetch the order to verify it has all items
      const orderRes = await fetch(`/api/orders/${pendingOrderId}`);
      if (!orderRes.ok) {
        throw new Error("Failed to fetch order");
      }

      const order = await orderRes.json();
      console.log("📦 Order ready for payment:", order);

      // Navigate to payment page
      router.push(`/orders/${order.id}`);
      setLoading(false);
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Failed to process checkout. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

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
        {loading ? 'Processing...' : 'Confirm & Pay'}
      </button>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      <p className="text-xs text-gray-500 text-center">
        You'll be able to simulate payment on the next screen
      </p>
    </div>
  );
}
