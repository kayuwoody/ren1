'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

/**
 * Receipt Display Page
 *
 * Fetches and displays the hosted online receipt.
 * Receipts are generated via /api/receipts/generate and uploaded to FTP.
 */
export default function ReceiptPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [receiptHtml, setReceiptHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!orderId) return;

    const fetchReceipt = async () => {
      try {
        setLoading(true);
        setError('');

        // Fetch hosted online receipt
        const receiptDomain = process.env.NEXT_PUBLIC_RECEIPT_DOMAIN || 'coffee-oasis.com.my';
        const onlineReceiptUrl = `https://${receiptDomain}/receipts/order-${orderId}.html`;

        console.log(`📄 Fetching online receipt: ${onlineReceiptUrl}`);

        const response = await fetch(onlineReceiptUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch receipt: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        setReceiptHtml(html);
        console.log(`✅ Receipt loaded successfully (${html.length} bytes)`);
      } catch (err: any) {
        console.error('❌ Failed to load receipt:', err);
        setError(err.message || 'Failed to load receipt');
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [orderId]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Loading Receipt...
          </h2>
          <p className="text-gray-600">
            Fetching your online receipt
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to Load Receipt
          </h2>
          <p className="text-gray-600 mb-4">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Display receipt HTML
  return (
    <div
      className="min-h-screen bg-gray-50"
      dangerouslySetInnerHTML={{ __html: receiptHtml }}
    />
  );
}
