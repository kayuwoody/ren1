'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Helper function to get status badge
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { icon: string; color: string; bg: string; label: string }> = {
      'pending': { icon: '🟡', color: 'text-yellow-800', bg: 'bg-yellow-100', label: 'Pending' },
      'processing': { icon: '🔵', color: 'text-blue-800', bg: 'bg-blue-100', label: 'Preparing' },
      'ready-for-pickup': { icon: '🟢', color: 'text-green-800', bg: 'bg-green-100', label: 'Ready!' },
      'completed': { icon: '⚪', color: 'text-gray-600', bg: 'bg-gray-100', label: 'Completed' },
    };

    const badge = badges[status] || { icon: '⚫', color: 'text-gray-800', bg: 'bg-gray-100', label: status };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${badge.color} ${badge.bg}`}>
        <span>{badge.icon}</span>
        <span>{badge.label}</span>
      </span>
    );
  };

  // Fetch all orders; server will use userId cookie if present, otherwise guestId fallback
  useEffect(() => {
    setLoading(true);
    fetch('/api/orders')
      .then((res) => res.json())
      .then((data) => {
        setOrders(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Failed to fetch orders', err);
        setOrders([]);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p className="p-4">Loading orders…</p>;
  }

  // Filter and search
  const filtered = orders.filter((order) => {
    const matchesStatus =
      statusFilter === 'all' || order.status === statusFilter;
    const matchesSearch =
      order.id.toString().includes(search) ||
      (order.line_items ?? []).some((item: any) =>
        item.name.toLowerCase().includes(search.toLowerCase())
      );
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>

      {/* Search and filter controls */}
      <div className="flex gap-2">
        <input
          type="text"
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
          <option value="ready-for-pickup">Ready</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Orders list */}
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
                  className="block"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">Order #{order.id}</p>
                      <p className="text-xs text-gray-500">
                        {dateLabel}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">RM {order.total ?? '—'}</p>
                      {order.line_items?.length ? (
                        <p className="text-xs text-gray-500">
                          {order.line_items.length} item
                          {order.line_items.length > 1 ? 's' : ''}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(order.status)}
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
