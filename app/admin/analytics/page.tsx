'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  AlertTriangle,
  ShoppingCart,
  Percent,
  Users,
} from 'lucide-react';

interface OrderStats {
  totalOrders: number;
  totalRevenue: number;
  totalCOGS: number;
  totalProfit: number;
  averageOrderValue: number;
  averageMargin: number;
}

interface CategoryPerformance {
  category: string;
  totalSold: number;
  totalRevenue: number;
  totalProfit: number;
  avgMargin: number;
  uniqueProducts: number;
}

interface FrequentPair {
  product1Name: string;
  product2Name: string;
  timesBoughtTogether: number;
  avgCombinedMargin: number;
}

interface DiscountImpact {
  withDiscount: { orders: number; avgMargin: number; avgOrderValue: number };
  withoutDiscount: { orders: number; avgMargin: number; avgOrderValue: number };
}

interface OverviewData {
  orderStats: OrderStats;
  categoryPerformance: CategoryPerformance[];
  frequentPairs: FrequentPair[];
  discountImpact: DiscountImpact;
  period: { start: string; end: string };
}

export default function AnalyticsPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30');

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  async function fetchAnalytics() {
    try {
      setLoading(true);
      const endDate = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));

      const res = await fetch(
        `/api/admin/analytics/overview?startDate=${startDate.toISOString()}&endDate=${endDate}`
      );
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Analytics & Insights</h1>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-500">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  const { orderStats, categoryPerformance, frequentPairs, discountImpact } = data;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Analytics & Insights</h1>
          </div>

          {/* Period Selector */}
          <div className="flex gap-2">
            {(['7', '30', '90'] as const).map((days) => (
              <button
                key={days}
                onClick={() => setPeriod(days)}
                className={`px-4 py-2 rounded ${
                  period === days
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <ShoppingCart className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-2xl font-bold">{orderStats.totalOrders}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold">RM {orderStats.totalRevenue.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-gray-500">Gross Profit</p>
                <p className="text-2xl font-bold text-green-600">
                  RM {orderStats.totalProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-2">
              <Percent className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-gray-500">Avg Margin</p>
                <p className="text-2xl font-bold">{orderStats.averageMargin.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-lg mb-4">Order Breakdown</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Average Order Value</span>
                <span className="font-semibold">RM {orderStats.averageOrderValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total COGS</span>
                <span className="font-semibold">RM {orderStats.totalCOGS.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Profit Margin</span>
                <span className="font-semibold text-green-600">
                  {orderStats.averageMargin.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-lg mb-4">Discount Impact</h3>
            <div className="space-y-3">
              <div className="border-b pb-3">
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">With Discount</span>
                  <span className="font-semibold">{discountImpact.withDiscount.orders} orders</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg Margin</span>
                  <span className="text-yellow-600">
                    {discountImpact.withDiscount.avgMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-gray-600">Without Discount</span>
                  <span className="font-semibold">{discountImpact.withoutDiscount.orders} orders</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avg Margin</span>
                  <span className="text-green-600">
                    {discountImpact.withoutDiscount.avgMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Category Performance */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" />
              Category Performance
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Sold</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Revenue</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Profit</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Margin</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Products</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {categoryPerformance.map((cat) => (
                  <tr key={cat.category} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium capitalize">{cat.category}</td>
                    <td className="px-6 py-4 text-right">{cat.totalSold}</td>
                    <td className="px-6 py-4 text-right">RM {cat.totalRevenue.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-green-600 font-semibold">
                      RM {cat.totalProfit.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cat.avgMargin >= 60 ? 'text-green-600' : 'text-yellow-600'}>
                        {cat.avgMargin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-gray-500">{cat.uniqueProducts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Combo Recommendations */}
        {frequentPairs.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Users className="w-6 h-6 text-purple-600" />
                Combo Recommendations
                <span className="text-sm font-normal text-gray-500 ml-2">
                  (Products frequently bought together)
                </span>
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {frequentPairs.map((pair, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">
                        {pair.product1Name} + {pair.product2Name}
                      </p>
                      <p className="text-sm text-gray-500">
                        Bought together {pair.timesBoughtTogether} times
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Combined Margin</p>
                      <p className="text-lg font-semibold text-green-600">
                        {pair.avgCombinedMargin.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/admin/analytics/products"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Product Insights
            </h3>
            <p className="text-gray-600">
              View detailed product performance, declining margins, and profitability trends
            </p>
          </Link>

          <Link
            href="/admin/costs"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <h3 className="font-semibold text-lg mb-2 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-orange-600" />
              Manage Costs
            </h3>
            <p className="text-gray-600">
              Update product COGS and ingredient prices to keep margins accurate
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
