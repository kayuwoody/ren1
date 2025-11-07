"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function PaymentFailedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderID = searchParams.get("order");
  const status = searchParams.get("status");
  const reason = searchParams.get("reason");

  const getErrorMessage = () => {
    if (reason === "invalid_signature") {
      return "Payment verification failed. Please contact support.";
    }
    if (status === "11") {
      return "Payment was declined. Please try again with a different payment method.";
    }
    if (status === "22") {
      return "Payment is still pending. Please wait for confirmation.";
    }
    return "Payment could not be completed. Please try again.";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Error Icon */}
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Payment Failed
        </h1>
        <p className="text-gray-600 mb-6">{getErrorMessage()}</p>

        {/* Order Details */}
        {orderID && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">Order ID</p>
            <p className="text-lg font-semibold text-gray-900">{orderID}</p>
            {status && (
              <>
                <p className="text-sm text-gray-500 mt-3 mb-1">Status Code</p>
                <p className="text-sm font-mono text-gray-700">{status}</p>
              </>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push(`/checkout?retry=${orderID}`)}
            className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push("/orders")}
            className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            View My Orders
          </button>
          <button
            onClick={() => router.push("/")}
            className="w-full px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Back to Home
          </button>
        </div>

        {/* Support Info */}
        <p className="text-xs text-gray-400 mt-6">
          Need help? Contact support with your order ID.
        </p>
      </div>
    </div>
  );
}
