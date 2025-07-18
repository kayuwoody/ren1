'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getGuestId } from '@/lib/getGuestId';

type WooLineItem = {
  id: number;
  name: string;
  quantity: number;
  total: string;
};

type WooOrder = {
  id: number;
  status: string;
  date_created: string;
  total: string;
  line_items?: WooLineItem[];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<WooOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const gid = getGuestId(); // server will ignore if logged-in cookie present
    fetch(`/api/orders?guestId=${gid}`)
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

  const filtered = orders.filter((order) => {
    const matchesStatus =
      statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch =
      order.id.toString().includes(search) ||
      (order.line_items ?? []).some((i) =>
        i.name.toLowerCase().includes(search.toLowerCase())
      );
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>

      {/* Controls */}
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
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="ready-to-pickup">Ready</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((order) => {
            const isCompleted = order.status === 'completed';
            const dateLabel = order.date_created
              ? new Date(order.date_created).toLocaleDateString()
              : '';
            return (
              <li
                key={order.id}
                className={`border rounded p-4 transition ${
                  isCompleted ? 'opacity-50' : 'hover:bg-gray-50'
                }`}
              >
                <Link
                  href={`/orders/${order.id}`}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold">Order #{order.id}</p>
                    <p className="text-xs text-gray-500">
                      {dateLabel} • {order.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      RM {order.total ?? '—'}
                    </p>
                    {order.line_items?.length ? (
                      <p className="text-xs text-gray-500">
                        {order.line_items.length} item
                        {order.line_items.length > 1 ? 's' : ''}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
