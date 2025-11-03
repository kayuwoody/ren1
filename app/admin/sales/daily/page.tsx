'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, DollarSign, TrendingUp, ShoppingBag, ChevronDown, ChevronUp } from 'lucide-react';

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  retailPrice: number;
  finalPrice: number;
  discountReason?: string;
  itemTotal: number;
  itemCOGS: number;
  itemProfit: number;
  itemMargin: number;
}

interface Order {
  id: number;
  orderNumber: string;
  dateCreated: string;
  status: string;
  customerName: string;
  items: OrderItem[];
  retailTotal: number;
  finalTotal: number;
  totalDiscount: number;
  orderCOGS: number;
  profit: number;
  margin: number;
}

interface DailySalesData {
  date: string;
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalRetail: number;
    totalDiscounts: number;
    totalCOGS: number;
    totalProfit: number;
    overallMargin: number;
  };
  orders: Order[];
}

export default function DailySalesDetailPage() {
  const [data, setData] = useState<DailySalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Set default date to today in UTC+8
    const now = new Date();
    const utc8Offset = 8 * 60;
    const utc8Time = new Date(now.getTime() + (utc8Offset * 60 * 1000));
    const todayStr = utc8Time.toISOString().split('T')[0];
    setSelectedDate(todayStr);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchDailySales();
    }
  }, [selectedDate]);

  const fetchDailySales = async () => {
    setLoading(true);
    try {
      const url = `/api/admin/sales/daily?date=${selectedDate}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setData(data);
      }
    } catch (err) {
      console.error('Failed to fetch daily sales:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleOrderExpand = (orderId: number) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const expandAll = () => {
    if (data) {
      setExpandedOrders(new Set(data.orders.map(o => o.id)));
    }
  };

  const collapseAll = () => {
    setExpandedOrders(new Set());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Loading daily sales...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Failed to load daily sales</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/sales" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Daily Sales Detail</h1>
              <p className="text-sm text-gray-500">Order-by-order breakdown for {data.date}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Date Selector & Controls */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Select Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={expandAll}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <ShoppingBag className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold text-blue-600">{data.summary.totalOrders}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  RM {data.summary.totalRevenue.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Profit</p>
                <p className="text-2xl font-bold text-emerald-600">
                  RM {data.summary.totalProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Margin</p>
                <p className={`text-2xl font-bold ${
                  data.summary.overallMargin >= 60 ? 'text-green-600' :
                  data.summary.overallMargin >= 40 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {data.summary.overallMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {data.orders.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">No orders found for {data.date}</p>
            </div>
          ) : (
            data.orders.map((order) => {
              const isExpanded = expandedOrders.has(order.id);
              const hasDiscount = order.totalDiscount > 0;

              return (
                <div key={order.id} className="bg-white rounded-lg shadow">
                  {/* Order Header - Always Visible */}
                  <div
                    onClick={() => toggleOrderExpand(order.id)}
                    className="p-6 cursor-pointer hover:bg-gray-50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <h3 className="text-lg font-bold">Order #{order.orderNumber}</h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                            order.status === 'completed' ? 'bg-green-100 text-green-800' :
                            order.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {order.status.replace('-', ' ')}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500">Customer</p>
                            <p className="font-medium">{order.customerName}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Time</p>
                            <p className="font-medium">
                              {new Date(order.dateCreated).toLocaleTimeString('en-MY', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500">Revenue</p>
                            <p className="font-bold text-green-600">RM {order.finalTotal.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Profit</p>
                            <p className="font-bold text-emerald-600">
                              RM {order.profit.toFixed(2)}
                              <span className={`ml-2 text-xs ${
                                order.margin >= 60 ? 'text-green-600' :
                                order.margin >= 40 ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                ({order.margin.toFixed(1)}%)
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="ml-4">
                        {isExpanded ? (
                          <ChevronUp className="w-6 h-6 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Order Details - Expandable */}
                  {isExpanded && (
                    <div className="border-t">
                      {/* Items */}
                      <div className="p-6">
                        <h4 className="font-semibold mb-4">Order Items</h4>
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-4 py-2 text-left">Item</th>
                              <th className="px-4 py-2 text-center">Qty</th>
                              <th className="px-4 py-2 text-right">Price</th>
                              <th className="px-4 py-2 text-right">Total</th>
                              <th className="px-4 py-2 text-right">COGS</th>
                              <th className="px-4 py-2 text-right">Profit</th>
                              <th className="px-4 py-2 text-right">Margin</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {order.items.map((item, idx) => {
                              const hasItemDiscount = item.discountReason;
                              return (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="px-4 py-3">
                                    <div>
                                      <p className="font-medium">{item.name}</p>
                                      {hasItemDiscount && (
                                        <p className="text-xs text-green-600 mt-1">• {item.discountReason}</p>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center">{item.quantity}</td>
                                  <td className="px-4 py-3 text-right">
                                    {hasItemDiscount && (
                                      <div className="text-xs text-gray-400 line-through">
                                        RM {item.retailPrice.toFixed(2)}
                                      </div>
                                    )}
                                    <div className={hasItemDiscount ? 'text-green-600 font-medium' : ''}>
                                      RM {item.finalPrice.toFixed(2)}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold">
                                    RM {item.itemTotal.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-right text-red-600">
                                    RM {item.itemCOGS.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-green-600">
                                    RM {item.itemProfit.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`font-semibold ${
                                      item.itemMargin >= 60 ? 'text-green-600' :
                                      item.itemMargin >= 40 ? 'text-yellow-600' : 'text-red-600'
                                    }`}>
                                      {item.itemMargin.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Order Summary */}
                      <div className="bg-gray-50 p-6 border-t">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {hasDiscount && (
                            <>
                              <div>
                                <p className="text-sm text-gray-500">Retail Total</p>
                                <p className="text-lg font-semibold line-through text-gray-400">
                                  RM {order.retailTotal.toFixed(2)}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Discount</p>
                                <p className="text-lg font-semibold text-orange-600">
                                  -RM {order.totalDiscount.toFixed(2)}
                                </p>
                              </div>
                            </>
                          )}
                          <div>
                            <p className="text-sm text-gray-500">Revenue</p>
                            <p className="text-lg font-bold text-green-600">
                              RM {order.finalTotal.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">COGS</p>
                            <p className="text-lg font-bold text-red-600">
                              RM {order.orderCOGS.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Profit</p>
                            <p className="text-lg font-bold text-emerald-600">
                              RM {order.profit.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Margin</p>
                            <p className={`text-lg font-bold ${
                              order.margin >= 60 ? 'text-green-600' :
                              order.margin >= 40 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {order.margin.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
