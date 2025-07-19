"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { getGuestId } from "@/lib/getGuestId";

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, clearCart } = useCart();
  const [error, setError] = useState("");

  // convenience: calculate total
  const total = cartItems.reduce(
    (sum: number, i: any) => sum + (i.price ?? 0) * (i.quantity ?? 0),
    0
  );

  async function handleConfirm() {
    setError("");

    if (!cartItems.length) {
      setError("Your cart is empty.");
      return;
    }

    // prefer logged-in user (mirrored locally after /api/login)
    const userIdStr =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    const userId = userIdStr ? Number(userIdStr) : undefined;

    // fallback guest identity
    const guestId = userId ? undefined : getGuestId();

    // Build payload for API (NOTE: use item.id, NOT productId)
    const payload: any = {
      line_items: cartItems.map((i: any) => ({
        product_id: i.productId, // correct field
        quantity: i.quantity,
      })),
      ...(userId ? { userId } : { guestId }),
    };

    console.log("🧾 Checkout payload:", payload);

    let wooOrder: any;
    try {
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) {
        console.error("Create order failed:", text);
        setError("Order failed. Please try again.");
        return;
      }

      wooOrder = JSON.parse(text);
    } catch (err) {
      console.error("Create order error:", err);
      setError("Network error creating order.");
      return;
    }

    // Persist timing info for progress UI (kept from original flow)
    localStorage.setItem("currentWooId", String(wooOrder.id));
    localStorage.setItem("startTime", String(Date.now()));
    // Duration: 2 min per cart item (matches your prior logic)
    const duration = 2 * 60 * 1000 * cartItems.length;
    localStorage.setItem("endTime", String(Date.now() + duration));

    clearCart();
    router.push(`/orders/${wooOrder.id}`);
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {/* Cart summary */}
      <ul className="mb-4 space-y-2">
        {cartItems.map((item: any) => (
          <li key={item.id} className="flex justify-between">
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
        className="w-full bg-green-600 text-white py-2 rounded"
      >
        Confirm &amp; Pay
      </button>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}
