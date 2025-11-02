'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DollarSign, TrendingUp, ShoppingCart, Calendar, Download, Percent } from 'lucide-react';

interface SalesReport {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalDiscounts: number;
  totalCOGS: number;
  totalProfit: number;
  overallMargin: number;
  revenueByDay: { date: string; revenue: number; orders: number; discounts: number; cogs: number; profit: number; margin: number }[];
  topProducts: { name: string; quantity: number; revenue: number; cogs: number; profit: number; margin: number }[];
  ordersByStatus: { status: string; count: number }[];
}

export default function SalesReportPage() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7days'); // 7days, 30days, 90days, all
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchSalesReport();
  }, [dateRange, startDate, endDate]);

  const fetchSalesReport = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/sales?range=${dateRange}`;
      if (startDate && endDate) {
        url = `/api/admin/sales?start=${startDate}&end=${endDate}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to fetch sales report:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!report) return;

    const csvData = [
      ['Sales Report'],
      ['Generated:', new Date().toLocaleString()],
      [''],
      ['Summary'],
      ['Total Revenue', `RM ${report.totalRevenue.toFixed(2)}`],
      ['Total Orders', report.totalOrders],
      ['Average Order Value', `RM ${report.averageOrderValue.toFixed(2)}`],
      ['Total Discounts', `RM ${report.totalDiscounts.toFixed(2)}`],
      [''],
      ['Daily Revenue'],
      ['Date', 'Revenue', 'Orders', 'Discounts'],
      ...report.revenueByDay.map(day => [
        day.date,
        day.revenue.toFixed(2),
        day.orders,
        day.discounts.toFixed(2)
      ]),
      [''],
      ['Top Products'],
      ['Product', 'Quantity Sold', 'Revenue'],
      ...report.topProducts.map(product => [
        product.name,
        product.quantity,
        product.revenue.toFixed(2)
      ]),
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Loading sales report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Failed to load sales report</p>
        </div>
      </div>
    );
  }

  const discountRate = report.totalRevenue > 0
    ? (report.totalDiscounts / (report.totalRevenue + report.totalDiscounts) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Sales Report</h1>
              <p className="text-sm text-gray-500">View and analyze sales performance</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Range
              </label>
              <select
                value={dateRange}
                onChange={(e) => {
                  setDateRange(e.target.value);
                  setStartDate('');
                  setEndDate('');
                }}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {dateRange === 'custom' && (
              <>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats Cards - Row 1: Revenue & Orders */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  RM {report.totalRevenue.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total COGS</p>
                <p className="text-2xl font-bold text-red-600">
                  RM {report.totalCOGS.toFixed(2)}
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
                <p className="text-sm text-gray-500">Gross Profit</p>
                <p className="text-2xl font-bold text-emerald-600">
                  RM {report.totalProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Percent className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Profit Margin</p>
                <p className={`text-2xl font-bold ${
                  report.overallMargin >= 60 ? 'text-green-600' :
                  report.overallMargin >= 40 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {report.overallMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards - Row 2: Secondary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <ShoppingCart className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold text-purple-600">
                  {report.totalOrders}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Avg Order Value</p>
                <p className="text-2xl font-bold text-indigo-600">
                  RM {report.averageOrderValue.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Percent className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Discounts</p>
                <p className="text-2xl font-bold text-orange-600">
                  RM {report.totalDiscounts.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {discountRate.toFixed(1)}% discount rate
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Revenue by Day */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Daily Revenue Breakdown
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Orders</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Discounts</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.revenueByDay.map((day) => (
                  <tr key={day.date} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{day.date}</td>
                    <td className="px-6 py-4 text-sm text-right">{day.orders}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold">
                      RM {day.revenue.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-red-600">
                      RM {day.cogs.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-green-600">
                      RM {day.profit.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span className={`font-semibold ${
                        day.margin >= 60 ? 'text-green-600' :
                        day.margin >= 40 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {day.margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-orange-600">
                      -RM {day.discounts.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Top Selling Products</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Sold</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.topProducts.map((product, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{product.name}</td>
                    <td className="px-6 py-4 text-sm text-right">{product.quantity}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold">
                      RM {product.revenue.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-red-600">
                      RM {product.cogs.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-green-600">
                      RM {product.profit.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <span className={`font-semibold ${
                        product.margin >= 60 ? 'text-green-600' :
                        product.margin >= 40 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {product.margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Orders by Status */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">Orders by Status</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {report.ordersByStatus.map((statusData) => (
                <div key={statusData.status} className="border rounded-lg p-4">
                  <p className="text-sm text-gray-500 capitalize">{statusData.status.replace('-', ' ')}</p>
                  <p className="text-2xl font-bold">{statusData.count}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
