"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { getGuestId } from "@/lib/getGuestId";

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, clearCart } = useCart();
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

    let wooOrder: any;

    try {
      // Check if we have a pending order to update
      const pendingOrderId = localStorage.getItem("pendingOrderId");

      if (pendingOrderId && pendingOrder) {
        // Update existing pending order
        console.log("📝 Updating existing pending order:", pendingOrderId);

        const updateRes = await fetch(`/api/orders/${pendingOrderId}/update-items`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line_items: lineItems })
        });

        if (!updateRes.ok) {
          console.error("Update order failed");
          // Fallback to creating new order
          localStorage.removeItem("pendingOrderId");
        } else {
          wooOrder = await updateRes.json();
          console.log("✅ Updated pending order:", wooOrder);
        }
      }

      // Create new order if no pending order or update failed
      if (!wooOrder) {
        console.log("🆕 Creating new pending order");

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

        wooOrder = await res.json();

        // Store as pending order
        localStorage.setItem("pendingOrderId", String(wooOrder.id));
        console.log("✅ Created pending order:", wooOrder.id);
      }
    } catch (err) {
      console.error("Order error:", err);
      setError("Network error. Please try again.");
      setLoading(false);
      return;
    }

    // Clear cart and navigate to order page
    clearCart();
    router.push(`/orders/${wooOrder.id}`);
    setLoading(false);
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {pendingOrder && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
          <p className="font-semibold text-yellow-800">
            ⚠️ You have an unpaid order
          </p>
          <p className="text-sm text-yellow-700 mt-1">
            Order #{pendingOrder.id} • RM {pendingOrder.total}
          </p>
          <p className="text-xs text-yellow-600 mt-2">
            Your current cart will update this order instead of creating a new one.
          </p>
        </div>
      )}

      {/* Cart summary */}
      <ul className="mb-4 space-y-2">
        {cartItems.map((item: any) => (
          <li key={item.productId} className="flex justify-between">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>
              RM {((item.price ?? 0) * (item.quantity ?? 0)).toFixed(2)}
            </span>
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
