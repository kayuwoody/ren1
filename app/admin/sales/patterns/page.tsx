'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Clock, Calendar } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface DayOfWeekData {
  day: number;
  dayName: string;
  revenue: number;
  orders: number;
  avgRevenue: number;
  avgOrders: number;
  occurrences: number;
}

interface DayOfMonthData {
  day: number;
  revenue: number;
  orders: number;
  avgRevenue: number;
  avgOrders: number;
  occurrences: number;
}

interface HourOfDayData {
  hour: number;
  revenue: number;
  orders: number;
  avgRevenue: number;
  avgOrders: number;
}

interface PatternsReport {
  dayOfWeek: DayOfWeekData[];
  dayOfMonth: DayOfMonthData[];
  hourOfDay: HourOfDayData[];
  totalOrders: number;
  totalRevenue: number;
  totalDays: number;
}

type Metric = 'revenue' | 'orders';

function Bar({ value, max, label, sublabel, color }: {
  value: number;
  max: number;
  label: string;
  sublabel: string;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 text-right text-xs font-medium text-gray-600 shrink-0">{label}</div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
          />
        </div>
        <div className="w-28 text-right text-xs text-gray-700 shrink-0 font-medium">{sublabel}</div>
      </div>
    </div>
  );
}

export default function SalesPatternsPage() {
  const { branchFetch } = useBranch();
  const [report, setReport] = useState<PatternsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('90days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hideStaffMeals, setHideStaffMeals] = useState(true);
  const [source, setSource] = useState<'all' | 'pos' | 'online'>('all');
  const [metric, setMetric] = useState<Metric>('revenue');

  useEffect(() => {
    fetchPatterns();
  }, [dateRange, startDate, endDate, hideStaffMeals, source]);

  const fetchPatterns = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/sales/patterns?range=${dateRange}&hideStaffMeals=${hideStaffMeals}&source=${source}`;
      if (startDate && endDate) {
        url = `/api/admin/sales/patterns?start=${startDate}&end=${endDate}&hideStaffMeals=${hideStaffMeals}&source=${source}`;
      }
      const res = await branchFetch(url);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch patterns:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-5xl mx-auto"><p>Loading patterns...</p></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-5xl mx-auto"><p>Failed to load patterns</p></div>
      </div>
    );
  }

  const isRevenue = metric === 'revenue';
  const fmt = (v: number) => isRevenue ? `RM ${v.toFixed(2)}` : `${Math.round(v)}`;
  const fmtAvg = (v: number) => isRevenue ? `RM ${v.toFixed(2)}` : `${v.toFixed(1)}`;

  const dowData = report.dayOfWeek;
  const dowMax = Math.max(...dowData.map(d => isRevenue ? d.avgRevenue : d.avgOrders));
  const dowBest = dowData.reduce((best, d) =>
    (isRevenue ? d.avgRevenue : d.avgOrders) > (isRevenue ? best.avgRevenue : best.avgOrders) ? d : best,
    dowData[0]
  );

  const domData = report.dayOfMonth;
  const domMax = Math.max(...domData.map(d => isRevenue ? d.avgRevenue : d.avgOrders));

  const hourData = report.hourOfDay;
  const hourMax = Math.max(...hourData.map(d => isRevenue ? d.avgRevenue : d.avgOrders));
  const peakHour = hourData.reduce((best, d) =>
    (isRevenue ? d.avgRevenue : d.avgOrders) > (isRevenue ? best.avgRevenue : best.avgOrders) ? d : best,
    hourData[0]
  );

  const formatHour = (h: number) => {
    if (h === 0) return '12am';
    if (h < 12) return `${h}am`;
    if (h === 12) return '12pm';
    return `${h - 12}pm`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/sales" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Sales Patterns</h1>
              <p className="text-sm text-gray-500">
                {report.totalOrders} orders across {report.totalDays} days — RM {report.totalRevenue.toFixed(2)} total
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
              <select
                value={dateRange}
                onChange={(e) => { setDateRange(e.target.value); setStartDate(''); setEndDate(''); }}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="30days">Last 30 Days</option>
                <option value="90days">Last 90 Days</option>
                <option value="ytd">Year to Date</option>
                <option value="all">All Time</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

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
              className={`px-4 py-2 rounded-lg transition ${
                hideStaffMeals ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {hideStaffMeals ? '✓ Staff Hidden' : 'Show Staff'}
            </button>

            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              {(['all', 'pos', 'online'] as const).map(s => (
                <button key={s} onClick={() => setSource(s)}
                  className={`px-3 py-2 text-sm font-medium transition ${
                    source === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}>
                  {s === 'all' ? 'All' : s === 'pos' ? 'POS' : 'Online'}
                </button>
              ))}
            </div>

            <div className="flex rounded-lg overflow-hidden border border-gray-300">
              {(['revenue', 'orders'] as const).map(m => (
                <button key={m} onClick={() => setMetric(m)}
                  className={`px-3 py-2 text-sm font-medium transition ${
                    metric === m ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                  }`}>
                  {m === 'revenue' ? 'Revenue' : 'Orders'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Day of Week */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              By Day of Week
            </h2>
            <span className="text-sm text-gray-500">
              Best: <span className="font-semibold text-blue-700">{dowBest.dayName}</span> — avg {fmtAvg(isRevenue ? dowBest.avgRevenue : dowBest.avgOrders)}{isRevenue ? '' : ' orders'}
            </span>
          </div>
          <div className="p-5 space-y-2">
            {[1, 2, 3, 4, 5, 6, 0].map(d => {
              const item = dowData[d];
              const val = isRevenue ? item.avgRevenue : item.avgOrders;
              return (
                <Bar
                  key={d}
                  label={item.dayName.slice(0, 3)}
                  value={val}
                  max={dowMax}
                  sublabel={`${fmtAvg(val)}/day (${fmt(isRevenue ? item.revenue : item.orders)} total)`}
                  color={item === dowBest ? '#2563EB' : '#93C5FD'}
                />
              );
            })}
          </div>
        </div>

        {/* Hour of Day */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-600" />
              By Hour of Day
            </h2>
            <span className="text-sm text-gray-500">
              Peak: <span className="font-semibold text-purple-700">{formatHour(peakHour.hour)}</span> — avg {fmtAvg(isRevenue ? peakHour.avgRevenue : peakHour.avgOrders)}{isRevenue ? '' : ' orders'}
            </span>
          </div>
          <div className="p-5 space-y-1.5">
            {hourData.map(item => {
              const val = isRevenue ? item.avgRevenue : item.avgOrders;
              if (val === 0 && item.orders === 0) return null;
              return (
                <Bar
                  key={item.hour}
                  label={formatHour(item.hour)}
                  value={val}
                  max={hourMax}
                  sublabel={`${fmtAvg(val)}/day (${fmt(isRevenue ? item.revenue : item.orders)} total)`}
                  color={item === peakHour ? '#7C3AED' : '#C4B5FD'}
                />
              );
            })}
          </div>
        </div>

        {/* Day of Month */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              By Day of Month
            </h2>
          </div>
          <div className="p-5 space-y-1.5">
            {domData.map(item => {
              const val = isRevenue ? item.avgRevenue : item.avgOrders;
              return (
                <Bar
                  key={item.day}
                  label={String(item.day)}
                  value={val}
                  max={domMax}
                  sublabel={`${fmtAvg(val)}/day (${fmt(isRevenue ? item.revenue : item.orders)} total)`}
                  color={val === domMax ? '#D97706' : '#FCD34D'}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
