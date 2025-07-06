'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const PAGE_SIZE = 10;

const formatDateHeading = (dateStr: string): string => {
  const today = new Date();
  const date = new Date(dateStr);
  const diffTime = today.getTime() - date.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const StatusBadge = ({ status }: { status: string }) => {
  const color =
    status === 'completed' ? 'bg-green-100 text-green-800' :
    status === 'processing' ? 'bg-blue-100 text-blue-800' :
    status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
    'bg-gray-100 text-gray-800';

  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded ${color}`}>
      {status}
    </span>
  );
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchId, setSearchId] = useState<string>('');

  useEffect(() => {
    const cid = localStorage.getItem('clientId');
    setClientId(cid);

    if (!cid) return;

    const fetchOrders = async () => {
      try {
        const res = await fetch(`/api/orders?cid=${cid}`);
        const data = await res.json();
        setOrders(data);
      } catch (err) {
        console.error('Failed to load orders:', err);
      }
    };

    fetchOrders();
  }, []);

  if (!clientId) {
    return <div className="p-4 text-center text-red-500">Missing client ID</div>;
  }

const filtered = (orders || []).filter((order) => {
  const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
  const matchesSearch = searchId === '' || order.id.toString().includes(searchId);
  return matchesStatus && matchesSearch;
});

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Group orders by date
  const grouped: { [key: string]: any[] } = {};
  for (const order of paginated) {
    const key = formatDateHeading(order.date_created);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(order);
  }

  return (
    <div className="p-4 max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>

      <div className="flex gap-2 flex-wrap items-center text-sm">
        <input
          placeholder="Search by order #"
          className="border px-2 py-1 rounded"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border px-2 py-1 rounded"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="ready">Ready</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500">No matching orders.</p>
      ) : (
        <>
          {Object.entries(grouped).map(([dateLabel, orders]) => (
            <div key={dateLabel} className="space-y-2">
              <h2 className="text-lg font-semibold mt-4">{dateLabel}</h2>
              {orders.map((order) => (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div
                    className={`p-4 border rounded hover:bg-gray-50 transition cursor-pointer ${
                      order.status === 'completed' ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold">Order #{order.id}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    <div className="text-sm flex justify-between text-gray-600">
                      <span>{order.line_items?.length ?? 0} item(s)</span>
                      <span className="font-semibold">RM {order.total}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ))}

          <div className="flex justify-between items-center pt-4">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-30"
            >
              ← Previous
            </button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <button
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded bg-gray-200 text-sm disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}