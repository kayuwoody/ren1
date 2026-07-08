'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Search, Filter, Clock, CheckCircle, AlertCircle, User } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
}

interface Order {
  id: number | string;
  number?: string;
  status: string;
  total: string;
  date_created: string;
  date_modified: string;
  line_items: any[];
  meta_data?: any[];
  customer_id: number;
  source?: 'pos' | 'online';
  billing?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
  };
}

// Which statuses count as "done" (no elapsed timer, counted as completed)
const DONE_STATUSES = ['completed', 'collected', 'rejected', 'cancelled'];

export default function AdminOrdersPage() {
  const { branchFetch } = useBranch();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'pos' | 'online'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [completionFilter, setCompletionFilter] = useState('all'); // all, manual, auto, webhook

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, statusFilter, sourceFilter, searchTerm, completionFilter, selectedCustomer]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      // Fetch all orders (you may need to create a special admin endpoint)
      const res = await branchFetch('/api/admin/orders');
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/admin/customers');
      if (res.ok) {
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    }
  };

  const filterOrders = () => {
    let filtered = [...orders];

    // Source filter (all / pos / online)
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(order => (order.source || 'pos') === sourceFilter);
    }

    // Customer filter
    if (selectedCustomer) {
      filtered = filtered.filter(order => order.customer_id === selectedCustomer.id);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.status === statusFilter);
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(order =>
        (order.number || order.id.toString()).includes(searchTerm) ||
        order.line_items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Completion method filter
    if (completionFilter !== 'all' && statusFilter === 'completed') {
      filtered = filtered.filter(order => {
        const autoCompleted = order.meta_data?.find(m => m.key === '_auto_completed')?.value;
        const pickupLocker = order.meta_data?.find(m => m.key === '_pickup_locker')?.value;

        if (completionFilter === 'auto' && autoCompleted === 'true') return true;
        if (completionFilter === 'webhook' && pickupLocker) return true;
        if (completionFilter === 'manual' && !autoCompleted && !pickupLocker) return true;
        return false;
      });
    }

    setFilteredOrders(filtered);
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { icon: string; color: string; bg: string }> = {
      // POS statuses
      'pending': { icon: '🟡', color: 'text-yellow-800', bg: 'bg-yellow-100' },
      'processing': { icon: '🔵', color: 'text-blue-800', bg: 'bg-blue-100' },
      'ready-for-pickup': { icon: '🟢', color: 'text-green-800', bg: 'bg-green-100' },
      'completed': { icon: '⚪', color: 'text-gray-600', bg: 'bg-gray-100' },
      // Online statuses
      'accepted': { icon: '🔵', color: 'text-blue-800', bg: 'bg-blue-100' },
      'ready': { icon: '🟢', color: 'text-green-800', bg: 'bg-green-100' },
      'collected': { icon: '⚪', color: 'text-gray-600', bg: 'bg-gray-100' },
      'rejected': { icon: '🔴', color: 'text-red-800', bg: 'bg-red-100' },
      'cancelled': { icon: '🔴', color: 'text-red-800', bg: 'bg-red-100' },
    };

    const badge = badges[status] || { icon: '⚫', color: 'text-gray-800', bg: 'bg-gray-100' };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${badge.color} ${badge.bg}`}>
        <span>{badge.icon}</span>
        <span>{status}</span>
      </span>
    );
  };

  const getElapsedTime = (order: Order) => {
    if (DONE_STATUSES.includes(order.status)) return null;

    const createdTime = new Date(order.date_created).getTime();
    const now = Date.now();
    const elapsedMs = now - createdTime;
    const elapsedMinutes = Math.floor(elapsedMs / 60000);

    if (elapsedMinutes < 60) {
      return `${elapsedMinutes}m`;
    } else {
      const hours = Math.floor(elapsedMinutes / 60);
      const mins = elapsedMinutes % 60;
      return `${hours}h ${mins}m`;
    }
  };

  const getCompletionMethod = (order: Order) => {
    if (order.source === 'online' || order.status !== 'completed') return null;

    const autoCompleted = order.meta_data?.find(m => m.key === '_auto_completed')?.value;
    const pickupLocker = order.meta_data?.find(m => m.key === '_pickup_locker')?.value;

    if (autoCompleted === 'true') {
      return <span className="text-xs text-orange-600 font-medium">⏰ Auto</span>;
    }
    if (pickupLocker) {
      return <span className="text-xs text-blue-600 font-medium">🔓 Webhook</span>;
    }
    return <span className="text-xs text-green-600 font-medium">👤 Manual</span>;
  };

  const statsData = {
    total: orders.length,
    pos: orders.filter(o => (o.source || 'pos') === 'pos').length,
    online: orders.filter(o => o.source === 'online').length,
    active: orders.filter(o => !DONE_STATUSES.includes(o.status)).length,
    done: orders.filter(o => DONE_STATUSES.includes(o.status)).length,
  };

  const filteredCustomers = customers.filter(c =>
    c.first_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.last_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone?.includes(customerSearch)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Order Management</h1>
                <p className="text-sm text-gray-500">Monitor and manage all orders</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Link
                href="/kitchen"
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition shadow-md"
              >
                <span className="text-xl">🍳</span>
                <span>Kitchen Display</span>
              </Link>
              <Link
                href="/delivery"
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition shadow-md"
              >
                <span className="text-xl">🚗</span>
                <span>Delivery Orders</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {/* Customer Sidebar */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            {selectedCustomer && (
              <button
                onClick={() => setSelectedCustomer(null)}
                className="w-full text-sm text-purple-600 hover:text-purple-800 font-medium"
              >
                Show All Customers
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p>No customers found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredCustomers.map((customer) => {
                  const customerOrders = orders.filter(o => o.customer_id === customer.id);
                  const isSelected = selectedCustomer?.id === customer.id;

                  return (
                    <button
                      key={customer.id}
                      onClick={() => setSelectedCustomer(customer)}
                      className={`w-full text-left p-4 hover:bg-purple-50 transition ${
                        isSelected ? 'bg-purple-50 border-l-4 border-purple-600' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <User className="w-5 h-5 text-purple-600" />
                        <div className="flex-1">
                          <div className="font-medium">
                            {customer.first_name} {customer.last_name}
                          </div>
                          <div className="text-sm text-gray-600">{customer.email}</div>
                          {customer.phone && (
                            <div className="text-xs text-gray-500">{customer.phone}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {customerOrders.length} order{customerOrders.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total Orders</p>
            <p className="text-2xl font-bold">{statsData.total}</p>
          </div>
          <div className="bg-slate-50 rounded-lg shadow p-4">
            <p className="text-sm text-slate-700">POS</p>
            <p className="text-2xl font-bold text-slate-800">{statsData.pos}</p>
          </div>
          <div className="bg-orange-50 rounded-lg shadow p-4">
            <p className="text-sm text-orange-700">Online</p>
            <p className="text-2xl font-bold text-orange-800">{statsData.online}</p>
          </div>
          <div className="bg-blue-50 rounded-lg shadow p-4">
            <p className="text-sm text-blue-700">Active</p>
            <p className="text-2xl font-bold text-blue-800">{statsData.active}</p>
          </div>
          <div className="bg-gray-50 rounded-lg shadow p-4">
            <p className="text-sm text-gray-700">Done</p>
            <p className="text-2xl font-bold text-gray-800">{statsData.done}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by order ID or product name..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Source Filter (all / pos / online) */}
            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              {(['all', 'pos', 'online'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => { setSourceFilter(s); setStatusFilter('all'); }}
                  className={`px-3 py-2 text-sm font-medium transition ${
                    sourceFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'pos' ? 'POS' : 'Online'}
                </button>
              ))}
            </div>

            {/* Status Filter (adapts to the selected source) */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              {sourceFilter !== 'online' && (
                <>
                  <option value="processing">Processing</option>
                  <option value="ready-for-pickup">Ready for Pickup</option>
                  <option value="completed">Completed</option>
                </>
              )}
              {sourceFilter !== 'pos' && (
                <>
                  <option value="accepted">Accepted</option>
                  <option value="ready">Ready</option>
                  <option value="collected">Collected</option>
                  <option value="rejected">Rejected</option>
                </>
              )}
            </select>

            {/* Completion Method Filter (only for completed orders) */}
            {statusFilter === 'completed' && (
              <select
                value={completionFilter}
                onChange={(e) => setCompletionFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Methods</option>
                <option value="manual">Manual</option>
                <option value="webhook">Webhook</option>
                <option value="auto">Auto-Cleanup</option>
              </select>
            )}
          </div>
        </div>

        {/* Orders Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Elapsed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="font-mono font-semibold">#{order.number || order.id}</span>
                      </td>
                      <td className="px-6 py-4">
                        {order.source === 'online' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-orange-800 bg-orange-100">🌐 Online</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-slate-700 bg-slate-100">🏪 POS</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(order.date_created).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {order.line_items.length} item{order.line_items.length > 1 ? 's' : ''}
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const finalTotal = order.meta_data?.find((m: any) => m.key === '_final_total')?.value;
                          const retailTotal = order.meta_data?.find((m: any) => m.key === '_retail_total')?.value;
                          const totalDiscount = order.meta_data?.find((m: any) => m.key === '_total_discount')?.value;
                          const hasDiscount = totalDiscount && parseFloat(totalDiscount) > 0;

                          return (
                            <div className="text-right">
                              {hasDiscount && (
                                <div className="text-xs text-gray-400 line-through">RM {parseFloat(retailTotal).toFixed(2)}</div>
                              )}
                              <div className={`font-semibold ${hasDiscount ? 'text-green-600' : ''}`}>
                                RM {finalTotal ? parseFloat(finalTotal).toFixed(2) : order.total}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="px-6 py-4">
                        {getElapsedTime(order) ? (
                          <span className="text-sm font-medium text-gray-700">
                            {getElapsedTime(order)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {getCompletionMethod(order)}
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          href={order.source === 'online' ? '/admin/online-orders' : `/orders/${order.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
