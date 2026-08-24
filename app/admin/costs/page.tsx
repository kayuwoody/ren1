'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingDown, Package, Coffee, Download, Calendar, Boxes } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface CostsReport {
  summary: { totalCOGS: number; materialCount: number; productCount: number };
  byMaterial: { name: string; unit: string; quantity: number; cost: number; share: number }[];
  byProduct: { name: string; orders: number; cost: number; share: number }[];
  byDay: { date: string; cost: number }[];
  dateRange: { start: string; end: string };
}

export default function CostsReportPage() {
  const { branchFetch } = useBranch();
  const [report, setReport] = useState<CostsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [month, setMonth] = useState('');
  const [hideStaffMeals, setHideStaffMeals] = useState(true);

  useEffect(() => {
    fetchReport();
  }, [dateRange, startDate, endDate, hideStaffMeals]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/costs?range=${dateRange}&hideStaffMeals=${hideStaffMeals}`;
      if (startDate && endDate) {
        url = `/api/admin/costs?start=${startDate}&end=${endDate}&hideStaffMeals=${hideStaffMeals}`;
      }
      const res = await branchFetch(url);
      if (res.ok) setReport(await res.json());
    } catch (err) {
      console.error('Failed to fetch costs report:', err);
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
      ['Cost of Goods Used'],
      ['Generated:', new Date().toLocaleString()],
      ['Total COGS', `RM ${report.summary.totalCOGS.toFixed(2)}`],
      [''],
      ['By Ingredient'],
      ['Item', 'Quantity', 'Unit', 'Cost (RM)', 'Share %'],
      ...report.byMaterial.map(m => [m.name, m.quantity.toFixed(2), m.unit, m.cost.toFixed(2), m.share.toFixed(1)]),
      [''],
      ['By Menu Item'],
      ['Product', 'Times Sold', 'Cost (RM)', 'Share %'],
      ...report.byProduct.map(p => [p.name, p.orders, p.cost.toFixed(2), p.share.toFixed(1)]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = `cost-of-goods-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 p-4"><div className="max-w-7xl mx-auto"><p>Loading costs report…</p></div></div>;
  }
  if (!report) {
    return <div className="min-h-screen bg-gray-50 p-4"><div className="max-w-7xl mx-auto"><p>Failed to load costs report</p></div></div>;
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
              <h1 className="text-2xl font-bold">Cost of Goods Used</h1>
              <p className="text-sm text-gray-500">What you consumed to generate the period&apos;s revenue</p>
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

            <button
              onClick={() => setHideStaffMeals(!hideStaffMeals)}
              className={`px-4 py-2 rounded-lg transition ${hideStaffMeals ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              {hideStaffMeals ? '✓ Staff Meals Hidden' : 'Show Staff Meals'}
            </button>

            <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
              <Download className="w-4 h-4" /> Export CSV
            </button>

            <Link href="/admin/inventory-value" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              <Boxes className="w-4 h-4" /> Inventory Value
            </Link>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-lg"><TrendingDown className="w-6 h-6 text-red-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Total COGS</p>
                <p className="text-2xl font-bold text-red-600">RM {report.summary.totalCOGS.toFixed(2)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg"><Package className="w-6 h-6 text-blue-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Ingredients Used</p>
                <p className="text-2xl font-bold text-blue-600">{report.summary.materialCount}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg"><Coffee className="w-6 h-6 text-purple-600" /></div>
              <div>
                <p className="text-sm text-gray-500">Products Made</p>
                <p className="text-2xl font-bold text-purple-600">{report.summary.productCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* By Ingredient */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b"><h2 className="text-xl font-semibold flex items-center gap-2"><Package className="w-5 h-5" /> Cost by Ingredient</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.byMaterial.map((m, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{m.name}</td>
                    <td className="px-6 py-4 text-sm text-right">{m.quantity.toFixed(m.unit === 'pcs' ? 0 : 1)} {m.unit}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-red-600">RM {m.cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-500">{m.share.toFixed(1)}%</td>
                  </tr>
                ))}
                {report.byMaterial.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No consumption in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Menu Item */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b"><h2 className="text-xl font-semibold flex items-center gap-2"><Coffee className="w-5 h-5" /> Cost by Menu Item</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Times Sold</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.byProduct.map((p, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{p.name}</td>
                    <td className="px-6 py-4 text-sm text-right">{p.orders}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-red-600">RM {p.cost.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-500">{p.share.toFixed(1)}%</td>
                  </tr>
                ))}
                {report.byProduct.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No consumption in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Day */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b"><h2 className="text-xl font-semibold flex items-center gap-2"><Calendar className="w-5 h-5" /> Daily Cost</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.byDay.map((d) => (
                  <tr key={d.date} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium">{d.date}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold text-red-600">RM {d.cost.toFixed(2)}</td>
                  </tr>
                ))}
                {report.byDay.length === 0 && (
                  <tr><td colSpan={2} className="px-6 py-8 text-center text-gray-400">No consumption in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
