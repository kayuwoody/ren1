'use client';

import { useEffect, useState } from 'react';
import { getClientId } from '@/lib/getClientId';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cid = getClientId();
    fetch(`/api/orders?cid=${cid}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch orders', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="p-4">Loading...</p>;

  // Filter and search
  const filtered = orders.filter((order) => {
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch =
      order.id.toString().includes(search) ||
      order.line_items.some((item: any) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      );
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search orders..."
          className="border px-2 py-1 rounded w-full"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border px-2 py-1 rounded"
        >
          <option value="all">All</option>
          <option value="processing">Processing</option>
          <option value="ready-for-pickup">Ready</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => (
            <li key={order.id} className="border rounded p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">Order #{order.id}</p>
                  <p className="text-sm text-gray-500">Status: {order.status}</p>
                </div>
                <a
                  href={`/orders/${order.id}`}
                  className="text-blue-600 hover:underline"
                >
                  View
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
