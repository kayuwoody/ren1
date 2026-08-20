'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Layers } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface CategoryRow {
  category: string;
  quantity: number;
  revenue: number;
  pctItems: number;
  pctRevenue: number;
}

interface CategoryReport {
  categories: CategoryRow[];
  totals: { items: number; revenue: number; categories: number };
  expanded: boolean;
  onlineCombosGrouped: number;
  dateRange: { start: string | null; end: string | null };
}

function titleCase(s: string) {
  return s
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CategoryBreakdownPage() {
  const { branchFetch } = useBranch();
  const [report, setReport] = useState<CategoryReport | null>(null);
  const [loading, setLoading] = useState(true);

  const [dateRange, setDateRange] = useState('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [month, setMonth] = useState('');
  const [hideStaffMeals, setHideStaffMeals] = useState(true);
  const [hideShellStaff, setHideShellStaff] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [source, setSource] = useState<'all' | 'pos' | 'online'>('all');

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

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, startDate, endDate, hideStaffMeals, hideShellStaff, expanded, source]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const base = startDate && endDate
        ? `start=${startDate}&end=${endDate}`
        : `range=${dateRange}`;
      const url = `/api/admin/sales/categories?${base}&hideStaffMeals=${hideStaffMeals}&hideShellStaff=${hideShellStaff}&expanded=${expanded}&source=${source}`;
      const res = await branchFetch(url);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      console.error('Failed to load category breakdown:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/sales/products" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Layers className="w-6 h-6 text-purple-600" />
              <div>
                <h1 className="text-2xl font-bold">Category Breakdown</h1>
                <p className="text-sm text-gray-500">Items sold per category and their share of sales</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[180px]">
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
              <div className="flex-1 min-w-[160px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Month</label>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => applyMonth(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {dateRange === 'custom' && (
              <>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
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
              onClick={() => setHideStaffMeals(!hideStaffMeals)}
              className={`px-4 py-2 rounded-lg transition ${
                hideStaffMeals ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {hideStaffMeals ? '✓ Staff Meals Hidden' : 'Show Staff Meals'}
            </button>

            <button
              onClick={() => setHideShellStaff(!hideShellStaff)}
              title="Orders where every item was rung up at staff price (Shell petrol-station staff)"
              className={`px-4 py-2 rounded-lg transition ${
                hideShellStaff ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {hideShellStaff ? '✓ Shell Staff Hidden' : 'Show Shell Staff'}
            </button>

            <button
              onClick={() => setExpanded(!expanded)}
              title="Break combos into their component categories (the coffee under Coffee, the danish under Pastry) instead of a single Combo bucket"
              className={`px-4 py-2 rounded-lg transition ${
                expanded ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {expanded ? '✓ Combos Expanded' : 'Group Combos'}
            </button>

            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              {(['all', 'pos', 'online'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`px-3 py-2 text-sm font-medium transition ${
                    source === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {s === 'all' ? 'All' : s === 'pos' ? 'POS' : 'Online'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">Loading…</div>
        ) : !report || report.categories.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">No sales in this period</div>
        ) : (
          <>
            {report.expanded && report.onlineCombosGrouped > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
                Note: {report.onlineCombosGrouped} online combo item(s) couldn&apos;t be broken down
                (the customer app doesn&apos;t store a reliable component list) and still count under
                &ldquo;Combo&rdquo;. POS combos are fully expanded.
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm text-gray-500">Categories</p>
                <p className="text-2xl font-bold">{report.totals.categories}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm text-gray-500">Total Items Sold</p>
                <p className="text-2xl font-bold">{report.totals.items.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold">RM {report.totals.revenue.toFixed(2)}</p>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items Sold</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Items</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {report.categories.map((c) => (
                      <tr key={c.category} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-800">{titleCase(c.category)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{c.quantity.toLocaleString()}</td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                              <div className="h-full bg-purple-500" style={{ width: `${Math.min(100, c.pctItems)}%` }} />
                            </div>
                            <span className="tabular-nums w-12 text-right">{c.pctItems.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums">RM {c.revenue.toFixed(2)}</td>
                        <td className="px-6 py-3 text-right tabular-nums">{c.pctRevenue.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50 font-semibold">
                    <tr>
                      <td className="px-6 py-3">Total</td>
                      <td className="px-6 py-3 text-right tabular-nums">{report.totals.items.toLocaleString()}</td>
                      <td className="px-6 py-3 text-right">100%</td>
                      <td className="px-6 py-3 text-right tabular-nums">RM {report.totals.revenue.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
