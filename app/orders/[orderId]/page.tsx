'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'react-qr-code';

type WooMeta = { key: string; value: any };

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!orderId) {
    console.error('No orderId in URL');
    return <div>Invalid order</div>;
  }

  // Helper to read meta
  const getMeta = (key: string): string | undefined =>
    order?.meta_data?.find((m: WooMeta) => m.key === key)?.value;

  // 1) Fetch & poll
  useEffect(() => {
    let active = true;
    const fetchOrder = async () => {
      console.log('⏳ Fetching order', orderId);
      try {
        const res = await fetch(`/api/orders/${orderId}`);
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
    const poll = setInterval(fetchOrder, 10_000);
    return () => {
      active = false;
      clearInterval(poll);
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
          <p className="text-sm text-gray-500">Preparing your order…</p>
          <progress value={progress} max={100} className="w-full h-4" />
        </div>
      )}

      {isReady && (
        <div className="space-y-2">
          <p>
            <strong>Locker Number:</strong>{' '}
            {getMeta('_locker_number') ?? '—'}
          </p>
          <p>
            <strong>Pickup Code:</strong>{' '}
            <span className="font-mono">
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
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2">Items Ordered:</h2>
        <ul className="space-y-2">
          {order.line_items.map((item: any) => (
            <li key={item.id} className="flex justify-between text-sm">
              <span>{item.name} × {item.quantity}</span>
              <span>RM {item.total}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-right font-bold text-lg">
          Total: RM {order.total}
        </p>
      </div>
    </div>
  );
}
