"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { getGuestId } from "@/lib/getGuestId";
import { printerManager } from "@/lib/printerService";

export default function PaymentPage() {
  const router = useRouter();
  const { cartItems, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Debug: Log cart items to see what data we have
  console.log("💳 Payment page cart items:", cartItems);

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

  async function handleSimulatePayment() {
    setLoading(true);
    setError("");

    if (!cartItems.length) {
      setError("Your cart is empty.");
      setLoading(false);
      return;
    }

    console.log("💳 Simulating payment for cart:", cartItems);

    try {
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

      // Create order
      const payload: any = {
        line_items: lineItems,
        ...(userId ? { userId } : { guestId }),
      };

      const createRes = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        console.error("Create order failed:", text);
        setError("Payment failed. Please try again.");
        setLoading(false);
        return;
      }

      const order = await createRes.json();
      console.log("✅ Created order:", order.id);

      // Update order status to processing (simulate payment success)
      const updateRes = await fetch(`/api/update-order/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "processing" }),
      });

      if (!updateRes.ok) {
        console.error("Update order status failed");
        setError("Payment failed. Please try again.");
        setLoading(false);
        return;
      }

      const updatedOrder = await updateRes.json();
      console.log("✅ Order marked as processing:", updatedOrder.id);

      // Auto-print kitchen stub (if printer is configured)
      try {
        const hasKitchenPrinter = printerManager.getPrinterConfig('kitchen');
        if (hasKitchenPrinter && printerManager.isBluetoothSupported()) {
          console.log('🖨️ Auto-printing kitchen stub...');
          const printer = printerManager.getKitchenPrinter();
          await printer.connect();
          await printer.printKitchenStub(order);
          console.log('✅ Kitchen stub printed');
        }
      } catch (printErr) {
        console.warn('Failed to print kitchen stub (non-critical):', printErr);
        // Don't block the flow if printing fails
      }

      // Clear cart now that payment is successful
      clearCart();

      // Add to active orders list for timer tracking
      const activeOrders = JSON.parse(localStorage.getItem("activeOrders") || "[]");
      if (!activeOrders.includes(String(order.id))) {
        activeOrders.push(String(order.id));
        localStorage.setItem("activeOrders", JSON.stringify(activeOrders));
      }

      // Trigger immediate timer refresh
      window.dispatchEvent(new Event("refreshActiveOrders"));

      console.log("✅ Payment processed, cart cleared, order active");

      // Navigate back to menu page
      router.push("/products");
    } catch (err) {
      console.error("Payment error:", err);
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  // If cart is empty, redirect back to products
  if (cartItems.length === 0) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Payment</h1>
        <p className="text-gray-600">Your cart is empty.</p>
        <button
          onClick={() => router.push("/products")}
          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Payment</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Review your order below and click "Simulate Payment" to complete your purchase.
        </p>
      </div>

      {/* Order summary */}
      <div className="bg-white border rounded-lg p-4 space-y-3">
        <h2 className="font-semibold text-lg">Order Summary</h2>
        <ul className="space-y-3">
          {cartItems.map((item) => {
            const hasDiscount = item.finalPrice < item.retailPrice;
            const itemRetailTotal = item.retailPrice * item.quantity;
            const itemFinalTotal = item.finalPrice * item.quantity;

            return (
              <li key={item.productId} className="border-b pb-3">
                <div className="flex justify-between mb-1">
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-gray-600">Qty: {item.quantity}</p>
                    {item.discountReason && (
                      <p className="text-xs text-green-600 mt-1">• {item.discountReason}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {hasDiscount && (
                      <p className="text-xs text-gray-400 line-through">
                        RM {itemRetailTotal.toFixed(2)}
                      </p>
                    )}
                    <p className={`font-semibold ${hasDiscount ? 'text-green-700' : ''}`}>
                      RM {itemFinalTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="pt-2 border-t space-y-1">
          {totalDiscount > 0 && (
            <>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Retail Total:</span>
                <span className="line-through">RM {retailTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600 font-semibold">
                <span>Total Discount:</span>
                <span>-RM {totalDiscount.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-xl font-bold pt-2">
            <span>Total:</span>
            <span className="text-green-700">RM {finalTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <button
        onClick={handleSimulatePayment}
        disabled={loading}
        className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-semibold"
      >
        {loading ? "Processing Payment..." : "Simulate Payment"}
      </button>

      <button
        onClick={() => router.back()}
        disabled={loading}
        className="w-full bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition disabled:opacity-50"
      >
        Back to Checkout
      </button>

      <p className="text-xs text-gray-500 text-center">
        This is a demo payment simulation. No actual payment will be processed.
      </p>
    </div>
  );
}
