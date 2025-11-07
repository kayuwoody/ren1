"use client";

import { useState } from "react";
import PaymentDisplay from "@/components/PaymentDisplay";
import { useRouter } from "next/navigation";

export default function TestPaymentPage() {
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createTestOrder = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/orders/create-with-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: [
            // Replace 123 with a real product ID from your WooCommerce
            { product_id: 123, quantity: 1 },
          ],
          billing: {
            first_name: "Test Customer",
            last_name: "User",
            email: "test@example.com",
            phone: "0123456789",
            address_1: "123 Test St",
            city: "Kuala Lumpur",
            postcode: "50000",
            country: "MY",
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to create order");
      }

      if (!data.order.payment_url) {
        throw new Error("No payment URL returned. Check WooCommerce Fiuu plugin is enabled.");
      }

      setOrder(data.order);
    } catch (err: any) {
      setError(err.message);
      console.error("Order creation error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (order) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-yellow-900 mb-2">🧪 Test Mode</h3>
            <p className="text-sm text-yellow-800">
              Order #{order.id} created. Complete payment to test the flow.
            </p>
            <p className="text-xs text-yellow-700 mt-2">
              Payment status will update automatically (polling every 3 seconds)
            </p>
          </div>

          <PaymentDisplay
            orderID={order.id}
            paymentURL={order.payment_url}
            amount={order.total}
            currency={order.currency}
            onSuccess={() => {
              alert(`✅ Payment successful for Order #${order.id}!`);
              // In production, redirect to order complete page
              // router.push('/order-complete');
            }}
            onCancel={() => {
              if (confirm("Go back to create another test order?")) {
                setOrder(null);
              }
            }}
          />

          <div className="mt-6 bg-white rounded-lg shadow p-4">
            <h3 className="font-semibold mb-2">Debug Info</h3>
            <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
              {JSON.stringify(
                {
                  orderID: order.id,
                  status: order.status,
                  total: order.total,
                  currency: order.currency,
                  paymentURL: order.payment_url?.substring(0, 50) + "...",
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-2">🧪 Test Payment Gateway</h1>
        <p className="text-gray-600 mb-6">
          Create a test order and complete payment to verify integration
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-red-900 mb-1">❌ Error</h3>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-900 mb-2">Prerequisites</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ WooCommerce API credentials configured</li>
            <li>✓ Fiuu plugin enabled in WooCommerce</li>
            <li>✓ At least one product in WooCommerce</li>
          </ul>
        </div>

        <button
          onClick={createTestOrder}
          disabled={loading}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium transition-colors"
        >
          {loading ? "Creating Test Order..." : "Create Test Order"}
        </button>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-2 font-medium">What happens:</p>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
            <li>Creates order in WooCommerce (status: pending)</li>
            <li>Displays QR code for payment</li>
            <li>Polls order status every 3 seconds</li>
            <li>Shows success when payment confirmed</li>
          </ol>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          Note: Replace product_id in code with a real product from your WooCommerce
        </p>
      </div>
    </div>
  );
}
