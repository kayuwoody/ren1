'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Coffee, Package, DollarSign, TrendingDown, Download, Calendar } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface StaffMealsReport {
  summary: { totalMeals: number; totalItems: number; totalCOGS: number; totalRetail: number };
  byProduct: { name: string; quantity: number; cogs: number; retail: number }[];
  byDay: { date: string; count: number; items: number; cogs: number; retail: number }[];
  dateRange: { start: string; end: string };
}

export default function StaffMealsReportPage() {
  const { branchFetch } = useBranch();
  const [report, setReport] = useState<StaffMealsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [month, setMonth] = useState('');

  useEffect(() => {
    fetchReport();
  }, [dateRange, startDate, endDate]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/staff-meals?range=${dateRange}`;
      if (startDate && endDate) {
        url = `/api/admin/staff-meals?start=${startDate}&end=${endDate}`;
      }
      const res = await branchFetch(url);
      if (res.ok) setReport(await res.json());
    } catch (err) {
      console.error('Failed to fetch staff meals report:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyMonth = (ym: string) => {
    setMonth(ym);
    if (!ym) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    setStartDate(`${ym}-01`);
    setEndDate(`${ym}-${String(lastDay).padStart(2, '0')}`);
  };

  const exportToCSV = () => {
    if (!report) return;
    const rows = [
      ['Staff Meals'],
      ['Generated:', new Date().toLocaleString()],
      ['Staff Meals', report.summary.totalMeals],
      ['Items', report.summary.totalItems],
      ['Cost to Business', `RM ${report.summary.totalCOGS.toFixed(2)}`],
      ['Retail Value', `RM ${report.summary.totalRetail.toFixed(2)}`],
      [''],
      ['By Item'],
      ['Product', 'Quantity', 'Cost (RM)', 'Retail Value (RM)'],
      ...report.byProduct.map(p => [p.name, p.quantity, p.cogs.toFixed(2), p.retail.toFixed(2)]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `staff-meals-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-4"><div className="max-w-7xl mx-auto"><p>Loading staff meals…</p></div></div>;
  }
  if (!report) {
    return <div className="min-h-screen bg-gray-50 p-4"><div className="max-w-7xl mx-auto"><p>Failed to load staff meals report</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Staff Meals</h1>
              <p className="text-sm text-gray-500">Free (100% discount) meals — cost to the business and retail value given up</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => {
                  const next = e.target.value;
                  setStartDate('');
                  setEndDate('');
                  setMonth('');
                  setDateRange(next);
                  if (next === 'month') {
                    const now = new Date();
                    applyMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
                  }
                }}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="7days">Last 7 Days</option>
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="mtd">Month to Date</option>
                <option value="month">Specific Month</option>
                <option value="ytd">Year to Date</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {dateRange === 'month' && (
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                <input type="month" value={month} onChange={(e) => applyMonth(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {dateRange === 'custom' && (
              <>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                </div>
              </>
            )}

            <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-pink-100 rounded-lg"><Coffee className="w-6 h-6 text-pink-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Staff Meals</p>
                <p className="text-2xl font-bold text-pink-600">{report.summary.totalMeals}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg"><Package className="w-6 h-6 text-purple-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Items</p>
                <p className="text-2xl font-bold text-purple-600">{report.summary.totalItems}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-lg"><TrendingDown className="w-6 h-6 text-red-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Cost to Business</p>
                <p className="text-2xl font-bold text-red-600">RM {report.summary.totalCOGS.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gray-100 rounded-lg"><DollarSign className="w-6 h-6 text-gray-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Retail Value</p>
                <p className="text-2xl font-bold text-gray-700">RM {report.summary.totalRetail.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">value given up</p>
              </div>
            </div>
          </div>
        </div>

        {/* By Item */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b"><h2 className="text-xl font-semibold flex items-center gap-2"><Package className="w-5 h-5" /> By Item</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Retail Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.byProduct.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-right">{p.quantity}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-red-600">RM {p.cogs.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">RM {p.retail.toFixed(2)}</td>
                  </tr>
                ))}
                {report.byProduct.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No staff meals in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Day */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b"><h2 className="text-xl font-semibold flex items-center gap-2"><Calendar className="w-5 h-5" /> By Day</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Meals</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Retail Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.byDay.map((d) => (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{d.date}</td>
                    <td className="px-6 py-4 text-sm text-right">{d.count}</td>
                    <td className="px-6 py-4 text-sm text-right">{d.items}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-red-600">RM {d.cogs.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">RM {d.retail.toFixed(2)}</td>
                  </tr>
                ))}
                {report.byDay.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No staff meals in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
