'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { FileText, Receipt } from 'lucide-react';

type WooMeta = { key: string; value: any };

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [orderDeleted, setOrderDeleted] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!orderId) {
    console.error('No orderId in URL');
    return <div>Invalid order</div>;
  }

  // Helper to read meta
  const getMeta = (key: string): string | undefined =>
    order?.meta_data?.find((m: WooMeta) => m.key === key)?.value;

  // Helper to read line item meta
  const getItemMeta = (item: any, key: string): string | undefined =>
    item.meta_data?.find((m: any) => m.key === key)?.value;

  // 1) Fetch & poll
  useEffect(() => {
    let active = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const fetchOrder = async () => {
      console.log('⏳ Fetching order', orderId);
      try {
        const res = await fetch(`/api/orders/${orderId}`);

        // Check if order was deleted
        if (res.status === 404) {
          console.log(`Order ${orderId} was deleted from WooCommerce`);
          if (!active) return;
          setOrderDeleted(true);
          setOrder(null);
          // Stop polling if order is deleted
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          return;
        }

        const data = await res.json();
        if (!active) return;
        console.log('📥 Fetched order', {
          status: data.status,
          meta: data.meta_data,
        });
        setOrder(data);
      } catch (e) {
        console.error('Fetch error', e);
      }
    };

    fetchOrder();
    pollInterval = setInterval(fetchOrder, 30_000); // Reduced from 10s to 30s to minimize API calls

    return () => {
      active = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [orderId]);

  // 2) Timer effect: watch for order to land in processing
  useEffect(() => {
    if (!order) return;
    console.log('🔄 Order state changed', order.status);

    // clear any existing timer
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (order.status === 'processing') {
      const startStr = getMeta('startTime');
      const endStr   = getMeta('endTime');
      console.log('⏲️ Timer meta', { startStr, endStr });
      const start = startStr ? Number(startStr) : NaN;
      const end   = endStr   ? Number(endStr)   : NaN;
      if (!start || !end || isNaN(start) || isNaN(end)) {
        console.warn('Missing or invalid start/end, cannot start timer');
        return;
      }

      // initial set
      const now = Date.now();
      const pct = Math.min(1, Math.max(0, (now - start) / (end - start)));
      console.log('▶️ Initial progress', pct * 100);
      setProgress(pct * 100);

      // tick every second
      intervalRef.current = setInterval(() => {
        const t = Date.now();
        const f = Math.min(1, Math.max(0, (t - start) / (end - start)));
        console.log('⏱️ Tick', f * 100);
        setProgress(f * 100);
      }, 1000);
    } else if (order.status === 'ready-for-pickup') {
      console.log('✅ Ready, filling to 100%');
      setProgress(100);
    } else {
      console.log('⏹️ Not processing, resetting progress');
      setProgress(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [order]);

  // 3) Render
  if (orderDeleted) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h1 className="text-2xl font-bold text-red-800 mb-2">Order Not Found</h1>
          <p className="text-red-600 mb-4">
            Order #{orderId} was deleted from WooCommerce.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return <div className="p-4">Loading order…</div>;
  }

  const isPending    = order.status === 'pending';
  const isProcessing = order.status === 'processing';
  const isReady      = order.status === 'ready-for-pickup';

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Order #{order.id}</h1>
      <p><strong>Status:</strong> {order.status}</p>

      {isPending && (
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          onClick={async () => {
            try {
              const res = await fetch(`/api/update-order/${order.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'processing' }),
              });
              if (res.ok) {
                const updated = await res.json();
                console.log('🔄 Order updated to processing', updated);
                setOrder(updated);

                // Add to active orders list for timer tracking
                const activeOrders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
                if (!activeOrders.includes(String(order.id))) {
                  activeOrders.push(String(order.id));
                  localStorage.setItem('activeOrders', JSON.stringify(activeOrders));
                }

                // Trigger immediate timer refresh
                window.dispatchEvent(new Event('refreshActiveOrders'));

                console.log('✅ Payment processed, added to active orders, timer refreshed');
              } else {
                console.error('Simulate payment failed');
              }
            } catch (e) {
              console.error(e);
            }
          }}
        >
          Simulate Payment
        </button>
      )}

      {isProcessing && (
        <div>
          <p className="text-sm text-gray-500">
            {progress >= 100 ? 'Out for Delivery to Locker…' : 'Preparing your order…'}
          </p>
          <progress value={progress} max={100} className="w-full h-4" />
          {progress >= 100 && (
            <p className="text-xs text-orange-600 mt-2">
              Your order will be ready for pickup once it's delivered to the locker
            </p>
          )}
        </div>
      )}

      {isReady && (
        <div className="space-y-4">
          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4">
            <p className="text-green-800 font-semibold text-lg mb-2">
              ✅ Your order is ready for pickup!
            </p>
            <p className="text-sm text-green-700">
              Use the QR code below to unlock the locker
            </p>
          </div>

          <div className="space-y-2">
            <p>
              <strong>Locker Number:</strong>{' '}
              {getMeta('_locker_number') ?? '—'}
            </p>
            <p>
              <strong>Pickup Code:</strong>{' '}
              <span className="font-mono text-lg">
                {getMeta('_pickup_code')}
              </span>
            </p>
            {getMeta('_pickup_qr_url') && (
              <div className="mt-2">
                <p className="font-semibold mb-1">QR Code:</p>
                <img
                  src={String(getMeta('_pickup_qr_url'))}
                  alt="QR Code"
                  className="w-32 h-32 border"
                />
              </div>
            )}
          </div>

          <button
            className="w-full mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
            onClick={async () => {
              if (!confirm('Confirm you have picked up your order?')) return;

              try {
                // 1. Mark order as completed
                const res = await fetch(`/api/update-order/${order.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: 'completed' }),
                });

                if (!res.ok) {
                  console.error('Failed to mark as completed');
                  alert('Failed to update order. Please try again.');
                  return;
                }

                const updated = await res.json();
                console.log('✅ Order marked as completed', updated);
                setOrder(updated);

                // 2. Award loyalty points
                try {
                  // Get userId from localStorage
                  const userId = localStorage.getItem('userId');
                  console.log('🔍 Attempting to award points:', { userId, orderId: order.id });

                  const pointsRes = await fetch('/api/loyalty/award', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      reason: 'manual_pickup',
                      orderId: order.id,
                      userId: userId ? Number(userId) : undefined
                    })
                  });

                  console.log('📊 Points API response status:', pointsRes.status);

                  if (pointsRes.ok) {
                    const pointsData = await pointsRes.json();
                    console.log('✅ Points awarded:', pointsData);
                    alert(`Thank you! Order completed.\n\n🎉 ${pointsData.message}\nNew balance: ${pointsData.balance} points`);
                  } else {
                    // Order completed but points failed - show error details
                    const errorData = await pointsRes.json().catch(() => ({ error: 'Unknown error' }));
                    console.error('❌ Points award failed:', errorData);
                    alert(`Thank you! Order marked as completed.\n\nNote: Points award failed: ${errorData.error || 'Unknown error'}`);
                  }
                } catch (pointsErr) {
                  console.error('❌ Points award exception:', pointsErr);
                  alert(`Thank you! Order marked as completed.\n\nNote: Points award error: ${pointsErr instanceof Error ? pointsErr.message : 'Unknown error'}`);
                }

                // 3. Remove from active orders
                const activeOrders = JSON.parse(localStorage.getItem('activeOrders') || '[]');
                const filteredOrders = activeOrders.filter((id: string) => id !== String(order.id));
                localStorage.setItem('activeOrders', JSON.stringify(filteredOrders));

              } catch (e) {
                console.error(e);
                alert('Error updating order. Please try again.');
              }
            }}
          >
            ✓ I Picked It Up
          </button>
          <p className="text-xs text-gray-500 text-center">
            Tap this button after collecting your order to earn +10 loyalty points!
          </p>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2">Items Ordered:</h2>
        <ul className="space-y-3">
          {order.line_items.map((item: any) => {
            const retailPrice = parseFloat(getItemMeta(item, '_retail_price') || item.price);
            const finalPrice = parseFloat(getItemMeta(item, '_final_price') || item.price);
            const discountReason = getItemMeta(item, '_discount_reason');
            const hasDiscount = retailPrice > finalPrice;
            const itemFinalTotal = finalPrice * item.quantity;
            const itemRetailTotal = retailPrice * item.quantity;

            // Check if this is a bundled product
            const isBundle = getItemMeta(item, '_is_bundle') === 'true';
            const bundleDisplayName = getItemMeta(item, '_bundle_display_name');
            const bundleBaseName = getItemMeta(item, '_bundle_base_product_name');
            const displayName = isBundle && bundleDisplayName ? bundleDisplayName : item.name;

            // Get expanded components from order item metadata (stored at order creation time)
            const componentsJson = getItemMeta(item, '_bundle_components');
            const expandedComponents = componentsJson ? JSON.parse(componentsJson) : [];

            return (
              <li key={item.id} className="border-b pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium">{displayName} × {item.quantity}</div>

                    {/* Show expanded components */}
                    {expandedComponents.length > 0 && (
                      <div className="mt-1 ml-4 space-y-0.5">
                        {expandedComponents.map((component: any, idx: number) => (
                          <div key={idx} className="text-xs text-gray-600 flex items-start">
                            <span className="mr-1">→</span>
                            <span>{component.productName} × {component.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isBundle && bundleBaseName && expandedComponents.length === 0 && (
                      <div className="text-xs text-gray-500">Base: {bundleBaseName}</div>
                    )}
                    {discountReason && (
                      <div className="text-xs text-green-600 mt-1">• {discountReason}</div>
                    )}
                  </div>
                  <div className="text-right">
                    {hasDiscount && (
                      <div className="text-xs text-gray-400 line-through">
                        RM {itemRetailTotal.toFixed(2)}
                      </div>
                    )}
                    <div className={`font-semibold ${hasDiscount ? 'text-green-600' : ''}`}>
                      RM {itemFinalTotal.toFixed(2)}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Show discount breakdown if applicable */}
        <div className="mt-4 space-y-1">
          {(() => {
            const retailTotal = parseFloat(getMeta('_retail_total') || order.total);
            const finalTotal = parseFloat(getMeta('_final_total') || order.total);
            const totalDiscount = parseFloat(getMeta('_total_discount') || '0');

            if (totalDiscount > 0) {
              return (
                <>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Retail Total:</span>
                    <span className="line-through">RM {retailTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600 font-semibold">
                    <span>Discount:</span>
                    <span>-RM {totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-green-700">RM {finalTotal.toFixed(2)}</span>
                  </div>
                </>
              );
            } else {
              return (
                <div className="flex justify-between text-lg font-bold pt-2 border-t">
                  <span>Total:</span>
                  <span>RM {order.total}</span>
                </div>
              );
            }
          })()}
        </div>
      </div>

      {/* Receipt and Orders Buttons */}
      <div className="pt-4 border-t space-y-3">
        {/* View Receipt Button */}
        {!isPending && (
          <a
            href={`https://${process.env.NEXT_PUBLIC_RECEIPT_DOMAIN || 'coffee-oasis.com.my'}/receipts/order-${orderId}.html`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            <Receipt className="w-5 h-5" />
            View Receipt
          </a>
        )}

        {/* View All Orders Button */}
        <Link
          href="/admin/orders"
          className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold py-3 px-4 rounded-lg transition"
        >
          <FileText className="w-5 h-5" />
          View All Orders
        </Link>
      </div>
    </div>
  );
}
