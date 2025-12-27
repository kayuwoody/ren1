"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import Link from "next/link";

export default function FiuuFailedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderid = searchParams.get("orderid");
  const error = searchParams.get("error") || "Payment was not completed";

  const handleRetry = () => {
    // Go back to payment selection
    router.push("/payment");
  };

  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {/* Failed Icon */}
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-12 h-12 text-red-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h1>
        <p className="text-gray-600 mb-6">{error}</p>

        {/* Order Info */}
        {orderid && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">Order ID</p>
            <p className="font-bold text-lg">#{orderid}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleRetry}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Try Again
          </button>
          <Link
            href="/admin/pos"
            className="block w-full px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Return to POS
          </Link>
        </div>

        <p className="text-xs text-gray-500 mt-6">
          If this problem persists, please try a different payment method or contact support.
        </p>
      </div>
    </div>
  );
}
