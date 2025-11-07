"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  const orderID = searchParams.get("order");
  const transactionID = searchParams.get("txn");

  useEffect(() => {
    // Countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Redirect to orders page or home
          router.push("/orders");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {/* Success Icon */}
        <div className="mb-6">
          <svg
            className="mx-auto h-16 w-16 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Payment Successful!
        </h1>
        <p className="text-gray-600 mb-6">
          Your payment has been processed successfully.
        </p>

        {/* Order Details */}
        {orderID && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">Order ID</p>
            <p className="text-lg font-semibold text-gray-900">{orderID}</p>
            {transactionID && (
              <>
                <p className="text-sm text-gray-500 mt-3 mb-1">
                  Transaction ID
                </p>
                <p className="text-sm font-mono text-gray-700">
                  {transactionID}
                </p>
              </>
            )}
          </div>
        )}

        {/* Info Message */}
        <p className="text-sm text-gray-500 mb-6">
          Your order is being prepared. You'll be notified when it's ready for
          pickup.
        </p>

        {/* Countdown */}
        <p className="text-sm text-gray-400 mb-4">
          Redirecting to your orders in {countdown} seconds...
        </p>

        {/* Manual Navigation */}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => router.push("/orders")}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            View My Orders
          </button>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
