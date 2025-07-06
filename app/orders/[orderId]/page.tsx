'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function OrderDetailPage({ params }: { params: { orderId: string } }) {
  const { orderId } = params;
  const [order, setOrder] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        const data = await res.json();
        setOrder(data);
      } catch {
        setOrder(null);
      }
    };

    fetchOrder();
    const iv = setInterval(fetchOrder, 10_000);
    return () => clearInterval(iv);
  }, [orderId]);

  useEffect(() => {
    if (order?.status?.toLowerCase().includes('processing')) {
      const start = Date.now();
      const end = start + 1000 * 60 * 5;
      const tick = () => {
        const now = Date.now();
        const pct = Math.min(1, (now - start) / (end - start));
        setProgress(pct * 100);
      };
      tick();
      const iv = setInterval(tick, 1000);
      return () => clearInterval(iv);
    } else if (order?.status?.toLowerCase().includes('ready')) {
      setProgress(100);
    }
  }, [order]);

  const isReady = order?.status?.toLowerCase().includes('ready');

  if (!order) return <div className="p-4">Loading order…</div>;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Order #{order.id}</h1>
      <p><strong>Status:</strong> {order.status}</p>

      {isReady && (
        <div className="space-y-2">
          <p><strong>Locker Number:</strong> {order.locker_number ?? '—'}</p>
          <p><strong>Pickup Code:</strong> <span className="font-mono">{order.pickup_code}</span></p>
          {order.qr_code && (
            <div className="mt-2">
              <p className="font-semibold mb-1">QR Code:</p>
              <img src={order.qr_code} alt="QR Code" className="w-32 h-32 border" />
            </div>
          )}
        </div>
      )}

      {order.status?.toLowerCase().includes('processing') && (
        <div>
          <p className="text-sm text-gray-500">Preparing your order…</p>
          <progress value={progress} max={100} className="w-full h-4" />
        </div>
      )}

      {order.status?.toLowerCase().includes('pending') && (
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
          Simulate Payment
        </button>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2">Items Ordered:</h2>
        <ul className="space-y-2">
          {order.line_items?.map((item: any) => (
            <li key={item.id} className="flex justify-between text-sm">
              <span>{item.name} × {item.quantity}</span>
              <span>RM {item.total}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-right font-bold text-lg">Total: RM {order.total}</p>
      </div>
    </div>
  );
}
