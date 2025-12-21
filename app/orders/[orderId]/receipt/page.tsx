'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

/**
 * Receipt Redirect Page
 *
 * Redirects to the hosted online receipt instead of rendering a local copy.
 * Receipts are generated via /api/receipts/generate and uploaded to FTP.
 */
export default function ReceiptPage() {
  const { orderId } = useParams<{ orderId: string }>();

  useEffect(() => {
    if (!orderId) return;

    // Redirect to hosted online receipt
    const receiptDomain = process.env.NEXT_PUBLIC_RECEIPT_DOMAIN || 'coffee-oasis.com.my';
    const onlineReceiptUrl = `https://${receiptDomain}/receipts/order-${orderId}.html`;

    console.log(`📄 Redirecting to online receipt: ${onlineReceiptUrl}`);
    window.location.href = onlineReceiptUrl;
  }, [orderId]);

  // Show loading message while redirecting
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Loading Receipt...
        </h2>
        <p className="text-gray-600">
          Redirecting to your online receipt
        </p>
      </div>
    </div>
  );
}
