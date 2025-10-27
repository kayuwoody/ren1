'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingDown, AlertTriangle, Package, DollarSign } from 'lucide-react';

interface ProductComparison {
  productId: string;
  productName: string;
  category: string;
  totalSold: number;
  totalRevenue: number;
  avgUnitPrice: number;
  avgCOGS: number;
  totalProfit: number;
  avgMargin: number;
}

interface DecliningProduct {
  productId: string;
  productName: string;
  recentMargin: number;
  previousMargin: number;
  marginChange: number;
  recentCOGS: number;
  previousCOGS: number;
  cogsChange: number;
}

interface ProductAnalytics {
  products: ProductComparison[];
  decliningMargins: DecliningProduct[];
  period: { start: string; end: string };
}

export default function ProductInsightsPage() {
  const [data, setData] = useState<ProductAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'profit' | 'margin' | 'revenue'>('profit');

  useEffect(() => {
    fetchProductAnalytics();
  }, []);

  async function fetchProductAnalytics() {
    try {
      setLoading(true);
      const endDate = new Date().toISOString();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const res = await fetch(
        `/api/admin/analytics/products?startDate=${startDate.toISOString()}&endDate=${endDate}`
      );
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error('Failed to fetch product analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin/analytics" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Product Insights</h1>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-500">Loading product analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  const { products, decliningMargins } = data;

  // Sort products
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'profit':
        return b.totalProfit - a.totalProfit;
      case 'margin':
        return b.avgMargin - a.avgMargin;
      case 'revenue':
        return b.totalRevenue - a.totalRevenue;
      default:
        return 0;
    }
  });

  function getMarginColor(margin: number) {
    if (margin >= 60) return 'text-green-600';
    if (margin >= 40) return 'text-yellow-600';
    return 'text-red-600';
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/analytics" className="text-blue-600 hover:text-blue-800">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold">Product Insights</h1>
        </div>

        {/* Declining Margins Alert */}
        {decliningMargins.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 text-lg mb-3">
                  ⚠️ Products with Declining Margins
                </h3>
                <div className="space-y-3">
                  {decliningMargins.map((product) => (
                    <div key={product.productId} className="bg-white rounded p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900">{product.productName}</p>
                          <p className="text-sm text-gray-500">
                            Margin dropped by {Math.abs(product.marginChange).toFixed(1)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">Current Margin</p>
                          <p className={`text-lg font-semibold ${getMarginColor(product.recentMargin)}`}>
                            {product.recentMargin.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Previous COGS</p>
                          <p className="font-medium">RM {product.previousCOGS.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Current COGS</p>
                          <p className="font-medium text-red-600">
                            RM {product.recentCOGS.toFixed(2)}
                            <span className="text-xs ml-1">
                              (+RM {product.cogsChange.toFixed(2)})
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-gray-700">
                          <strong>Action:</strong> Consider raising price by RM{' '}
                          {product.cogsChange.toFixed(2)} or reviewing ingredient costs
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Product Performance Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-6 h-6 text-blue-600" />
              Product Performance (Last 30 Days)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('profit')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'profit'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Profit
              </button>
              <button
                onClick={() => setSortBy('margin')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'margin'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Margin
              </button>
              <button
                onClick={() => setSortBy('revenue')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'revenue'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                By Revenue
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Rank</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Sold</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Avg Price</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Avg COGS</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Revenue</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Profit</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedProducts.map((product, idx) => (
                  <tr key={product.productId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-500">#{idx + 1}</td>
                    <td className="px-6 py-4 font-medium">{product.productName}</td>
                    <td className="px-6 py-4">
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">{product.totalSold}</td>
                    <td className="px-6 py-4 text-right">RM {product.avgUnitPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right text-gray-600">
                      RM {product.avgCOGS.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium">
                      RM {product.totalRevenue.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-green-600">
                      RM {product.totalProfit.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-semibold ${getMarginColor(product.avgMargin)}`}>
                        {product.avgMargin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {products.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No product data available for this period.</p>
            </div>
          )}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-500">Best Performer</p>
                <p className="font-semibold">{sortedProducts[0]?.productName || 'N/A'}</p>
                <p className="text-sm text-green-600">
                  RM {sortedProducts[0]?.totalProfit.toFixed(2) || '0.00'} profit
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-8 h-8 text-yellow-600" />
              <div>
                <p className="text-sm text-gray-500">Needs Attention</p>
                <p className="font-semibold">{decliningMargins.length} products</p>
                <p className="text-sm text-yellow-600">With declining margins</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-500">Total Products</p>
                <p className="font-semibold">{products.length} analyzed</p>
                <p className="text-sm text-blue-600">In last 30 days</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
