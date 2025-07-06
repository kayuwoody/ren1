'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string>('');

  useEffect(() => {
    // Ensure we have a clientId
    let cid = localStorage.getItem('clientId');
    if (!cid) {
      cid = crypto.randomUUID();
      localStorage.setItem('clientId', cid);
    }
    setClientId(cid);

    fetch('/api/orders')
      .then((res) => res.json())
      .then((all) => {
        if (!Array.isArray(all)) {
          console.error('Unexpected /api/orders payload', all);
          return setOrders([]);
        }

        const mine = all.filter((o) =>
          o.meta_data.some(
            (m: any) => m.key === 'clientId' && m.value === cid
          )
        );

        const processing = mine.filter((o: any) => o.status === 'processing');

        const rest = all
          .filter(
            (o: any) => !processing.some((p: any) => p.id === o.id)
          )
          .sort(
            (a: any, b: any) =>
              new Date(b.date_created).getTime() -
              new Date(a.date_created).getTime()
          );

        setOrders([...processing, ...rest]);
      })
      .catch((err) => {
        console.error('Failed to fetch orders:', err);
        setOrders([]);
      });
  }, []);

  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">All Orders</h1>
      {orders.length === 0 ? (
        <p>No orders yet.</p>
      ) : (
        <ul className="space-y-2">
          {orders.map((o) => (
            <li
              key={o.id}
              className={`p-2 rounded ${
                o.status === 'processing' ? 'bg-yellow-100' : 'bg-gray-100'
              }`}
            >
              <Link href={`/orders/${o.id}`}>
                <a>Order {o.id} — {o.status}</a>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
