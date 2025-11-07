"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CashPaymentProps {
  orderID: number;
  amount: string;
  currency?: string;
  paymentMethod?: "cash" | "bank_qr";
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Cash Payment Component
 *
 * Handles cash and local bank QR code payments.
 * Staff confirms payment received, then order is marked as paid.
 *
 * @example
 * ```tsx
 * <CashPayment
 *   orderID={12345}
 *   amount="25.50"
 *   paymentMethod="cash"
 *   onSuccess={() => router.push('/order-complete')}
 * />
 * ```
 */
export default function CashPayment({
  orderID,
  amount,
  currency = "MYR",
  paymentMethod = "cash",
  onSuccess,
  onCancel,
}: CashPaymentProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmPayment = async () => {
    setConfirming(true);
    setError(null);

    try {
      // Update order status to processing (payment received)
      const response = await fetch(`/api/orders/${orderID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "processing",
          meta_data: [
            { key: "_payment_method", value: paymentMethod },
            { key: "_payment_method_title", value: paymentMethod === "cash" ? "Cash" : "Bank QR" },
            { key: "_paid_date", value: new Date().toISOString() },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update order status");
      }

      console.log(`✅ Order #${orderID} marked as paid (${paymentMethod})`);
      onSuccess?.();
    } catch (err: any) {
      console.error("Failed to confirm payment:", err);
      setError(err.message || "Failed to confirm payment");
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    if (confirm("Cancel this payment?")) {
      onCancel?.();
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {paymentMethod === "cash" ? "💵 Cash Payment" : "📱 Bank QR Payment"}
        </h2>
        <p className="text-gray-600">Order #{orderID}</p>
      </div>

      {/* Amount */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Amount to Collect</p>
        <p className="text-4xl font-bold text-gray-900">
          {currency} {amount}
        </p>
      </div>

      {/* Instructions */}
      {paymentMethod === "cash" ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 font-medium mb-2">
            Cash Payment Steps:
          </p>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Collect {currency} {amount} from customer</li>
            <li>Give change if needed</li>
            <li>Click "Confirm Payment Received" below</li>
            <li>Order will be sent to kitchen</li>
          </ol>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-900 font-medium mb-2">
            Bank QR Payment Steps:
          </p>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Show customer the store's bank QR code</li>
            <li>Customer scans and pays {currency} {amount}</li>
            <li>Verify payment received on bank app</li>
            <li>Click "Confirm Payment Received" below</li>
          </ol>
          <p className="text-xs text-blue-700 mt-3">
            💡 Tip: Keep the physical QR code displayed at the counter
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={confirmPayment}
          disabled={confirming}
          className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors font-medium text-lg"
        >
          {confirming ? "Confirming..." : "✓ Confirm Payment Received"}
        </button>

        <button
          onClick={handleCancel}
          disabled={confirming}
          className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 transition-colors"
        >
          Cancel Order
        </button>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>Payment Method:</span>
          <span className="font-medium">
            {paymentMethod === "cash" ? "Cash" : "Bank Transfer (QR)"}
          </span>
        </div>
      </div>
    </div>
  );
}
