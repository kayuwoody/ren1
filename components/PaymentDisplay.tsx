"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePaymentStatus } from "@/lib/hooks/usePaymentStatus";

interface PaymentDisplayProps {
  orderID: number;
  paymentURL: string;
  amount: string;
  currency?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Payment Display Component
 *
 * Displays QR code and payment link for customer to complete payment.
 * Automatically polls order status and redirects when payment is confirmed.
 *
 * @example
 * ```tsx
 * <PaymentDisplay
 *   orderID={12345}
 *   paymentURL={order.payment_url}
 *   amount={order.total}
 *   onSuccess={() => router.push('/order-complete')}
 * />
 * ```
 */
export default function PaymentDisplay({
  orderID,
  paymentURL,
  amount,
  currency = "MYR",
  onSuccess,
  onCancel,
}: PaymentDisplayProps) {
  const router = useRouter();

  const { status, isPolling, error } = usePaymentStatus({
    orderID,
    enabled: true, // Auto-start polling
    onSuccess: (order) => {
      console.log("✅ Payment confirmed!", order);
      onSuccess?.();
    },
    onFailure: (order) => {
      console.log("❌ Payment failed", order);
    },
  });

  const handleCancel = () => {
    if (confirm("Cancel this payment? The order will be marked as cancelled.")) {
      onCancel?.();
    }
  };

  const getStatusDisplay = () => {
    if (!status) return { text: "Checking...", color: "text-gray-500" };

    switch (status) {
      case "pending":
        return { text: "Awaiting Payment", color: "text-yellow-600" };
      case "processing":
      case "completed":
        return { text: "Payment Confirmed! ✓", color: "text-green-600" };
      case "failed":
      case "cancelled":
        return { text: "Payment Failed", color: "text-red-600" };
      default:
        return { text: status, color: "text-gray-600" };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Scan to Pay
        </h2>
        <p className="text-gray-600">Order #{orderID}</p>
      </div>

      {/* Amount */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
        <p className="text-sm text-gray-500 mb-1">Total Amount</p>
        <p className="text-3xl font-bold text-gray-900">
          {currency} {amount}
        </p>
      </div>

      {/* Payment Link */}
      <div className="bg-white border-2 border-gray-200 rounded-lg p-6 mb-6 text-center">
        <p className="text-sm text-gray-600 mb-4">
          Open payment page to complete payment
        </p>
        <a
          href={paymentURL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Open Payment Page →
        </a>
      </div>

      {/* Status */}
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          {isPolling && (
            <div className="animate-pulse w-2 h-2 bg-blue-600 rounded-full"></div>
          )}
          <p className={`text-lg font-semibold ${statusDisplay.color}`}>
            {statusDisplay.text}
          </p>
        </div>
        {error && (
          <p className="text-red-600 text-sm mt-2">
            Error: {error.message}
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-900 font-medium mb-2">
          How to pay:
        </p>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Scan the QR code with your phone camera</li>
          <li>Choose your payment method (FPX, e-wallet, card)</li>
          <li>Complete the payment</li>
          <li>Wait for confirmation (automatic)</li>
        </ol>
      </div>

      {/* Alternative: Direct Link */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 mb-2">Or pay via link:</p>
        <a
          href={paymentURL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-800 underline text-sm break-all"
        >
          Open payment page →
        </a>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleCancel}
          className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => window.open(paymentURL, "_blank")}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Open Link
        </button>
      </div>

      {/* Footer */}
      <p className="text-xs text-gray-400 text-center mt-6">
        Payment powered by Fiuu via WooCommerce
      </p>
    </div>
  );
}
