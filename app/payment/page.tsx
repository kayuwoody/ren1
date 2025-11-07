"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import CashPayment from "@/components/CashPayment";

export default function PaymentPage() {
  const router = useRouter();
  const { cartItems, clearCart } = useCart();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_qr" | null>(null);

  // Calculate total (using finalPrice which includes discounts)
  const retailTotal = cartItems.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0);
  const finalTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const totalDiscount = retailTotal - finalTotal;
  const hasDiscount = totalDiscount > 0;

  // Create order when payment method is selected
  const handlePaymentMethodSelect = async (method: "cash" | "bank_qr") => {
    setPaymentMethod(method);
    setLoading(true);
    setError(null);

    try {
      // Create order in WooCommerce
      const response = await fetch("/api/orders/create-with-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: cartItems.map((item) => ({
            product_id: item.productId,
            quantity: item.quantity,
            price: item.finalPrice, // Use discounted price
            meta_data: item.discountReason ? [
              {
                key: "_discount_reason",
                value: item.discountReason,
              },
              {
                key: "_retail_price",
                value: item.retailPrice.toString(),
              },
              {
                key: "_discount_amount",
                value: (item.retailPrice - item.finalPrice).toString(),
              },
            ] : [],
          })),
          billing: {
            first_name: "Walk-in Customer",
            email: "pos@coffee-oasis.com.my",
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to create order");
      }

      setOrder(data.order);
    } catch (err: any) {
      console.error("Order creation error:", err);
      setError(err.message);
      setPaymentMethod(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    // Clear cart
    clearCart();

    // Show success and redirect to kitchen/orders
    alert(`✅ Payment confirmed! Order #${order.id} sent to kitchen.`);
    router.push("/orders");
  };

  const handleCancel = () => {
    setOrder(null);
    setPaymentMethod(null);
    setError(null);
  };

  // Redirect if cart is empty
  useEffect(() => {
    if (cartItems.length === 0 && !order) {
      router.push("/admin/pos");
    }
  }, [cartItems, order, router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-700">Creating order...</p>
        </div>
      </div>
    );
  }

  // Show CashPayment component after order created
  if (order && paymentMethod) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <CashPayment
          orderID={order.id}
          amount={order.total}
          paymentMethod={paymentMethod}
          onSuccess={handlePaymentSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  // Payment method selection screen
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Payment Method</h1>
        <p className="text-gray-600 mb-6">How will the customer pay?</p>

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-500 mb-1">Order Total</p>
          {hasDiscount && (
            <p className="text-lg text-gray-400 line-through">RM {retailTotal.toFixed(2)}</p>
          )}
          <p className="text-3xl font-bold text-gray-900">RM {finalTotal.toFixed(2)}</p>
          {hasDiscount && (
            <p className="text-sm text-green-600 font-medium mt-1">
              Saved RM {totalDiscount.toFixed(2)}
            </p>
          )}
          <p className="text-sm text-gray-600 mt-2">{cartItems.length} item(s)</p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Payment Method Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handlePaymentMethodSelect("cash")}
            className="w-full p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">💵</span>
              <div className="text-left">
                <p className="font-semibold">Cash Payment</p>
                <p className="text-sm text-green-100">Accept cash and give change</p>
              </div>
            </span>
            <span className="text-2xl">→</span>
          </button>

          <button
            onClick={() => handlePaymentMethodSelect("bank_qr")}
            className="w-full p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">📱</span>
              <div className="text-left">
                <p className="font-semibold">Bank QR Code</p>
                <p className="text-sm text-blue-100">Customer scans your QR</p>
              </div>
            </span>
            <span className="text-2xl">→</span>
          </button>
        </div>

        {/* Back Button */}
        <button
          onClick={() => router.push("/admin/pos")}
          className="w-full mt-6 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          ← Back to POS
        </button>
      </div>
    </div>
  );
}
