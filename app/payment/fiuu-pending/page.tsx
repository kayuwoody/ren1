"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Clock, Loader2, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";

export default function FiuuPendingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderid = searchParams.get("orderid");
  const status = searchParams.get("status");

  const [checking, setChecking] = useState(false);
  const [finalStatus, setFinalStatus] = useState<"pending" | "success" | "failed">("pending");

  // Poll for payment status
  useEffect(() => {
    if (!orderid) return;

    let attempts = 0;
    const maxAttempts = 30; // Check for 5 minutes (10s interval)

    const checkStatus = async () => {
      if (attempts >= maxAttempts) return;

      setChecking(true);
      try {
        // TODO: Implement status check endpoint
        // const response = await fetch(`/api/fiuu/check-status?orderid=${orderid}`);
        // const data = await response.json();

        // For now, just wait
        // if (data.status === '00') setFinalStatus('success');
        // if (data.status === '11') setFinalStatus('failed');
      } catch (err) {
        console.error("Status check error:", err);
      } finally {
        setChecking(false);
        attempts++;
      }
    };

    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [orderid]);

  if (finalStatus === "success") {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Confirmed!</h1>
          <p className="text-gray-600 mb-6">Your payment has been verified.</p>
          <Link
            href="/admin/pos"
            className="block w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
          >
            Return to POS
          </Link>
        </div>
      </div>
    );
  }

  if (finalStatus === "failed") {
    router.push(`/payment/fiuu-failed?orderid=${orderid}&error=Payment+verification+failed`);
    return null;
  }

  return (
    <div className="min-h-screen bg-yellow-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        {/* Pending Icon */}
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          {checking ? (
            <Loader2 className="w-12 h-12 text-yellow-600 animate-spin" />
          ) : (
            <Clock className="w-12 h-12 text-yellow-600" />
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Pending</h1>
        <p className="text-gray-600 mb-6">
          Your payment is being processed. This may take a few moments.
        </p>

        {/* Order Info */}
        {orderid && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">Order ID</p>
            <p className="font-bold text-lg">#{orderid}</p>
            {status && (
              <p className="text-xs text-gray-500 mt-1">Status code: {status}</p>
            )}
          </div>
        )}

        {/* Status message */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            {checking ? "Checking payment status..." : "Waiting for payment confirmation..."}
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link
            href="/admin/pos"
            className="block w-full px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
          >
            Return to POS
          </Link>
          <p className="text-xs text-gray-500">
            The order will be automatically updated once payment is confirmed.
          </p>
        </div>
      </div>
    </div>
  );
}
