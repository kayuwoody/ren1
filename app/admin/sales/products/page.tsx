'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, DollarSign, TrendingUp, TrendingDown, Download, Percent, Award, Star, ChevronDown, ChevronRight } from 'lucide-react';

interface SaleDetail {
  orderId: number;
  orderNumber: string;
  date: string;
  quantity: number;
  price: number;
  cogs: number;
}

interface ProductData {
  name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
  avgPrice: number;
  avgCogs: number;
  avgProfit: number;
  discountTotal: number;
  sales: SaleDetail[];
}

interface ProductsReport {
  summary: {
    totalProducts: number;
    totalItemsSold: number;
    totalRevenue: number;
    totalCOGS: number;
    totalProfit: number;
    overallMargin: number;
    totalDiscounts: number;
    avgPricePerItem: number;
    avgProfitPerItem: number;
  };
  allProducts: ProductData[];
  highlights: {
    topSelling: ProductData[];
    highestRevenue: ProductData[];
    highestProfit: ProductData[];
    bestMargin: ProductData[];
    worstMargin: ProductData[];
  };
  dateRange: {
    start: string;
    end: string;
  };
}

type SortField = 'name' | 'quantity' | 'revenue' | 'cogs' | 'profit' | 'margin';
type SortOrder = 'asc' | 'desc';

export default function ProductsSoldPage() {
  const [report, setReport] = useState<ProductsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hideStaffMeals, setHideStaffMeals] = useState(true);
  const [sortField, setSortField] = useState<SortField>('quantity');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  const toggleExpanded = (productName: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productName)) {
        next.delete(productName);
      } else {
        next.add(productName);
      }
      return next;
    });
  };

  useEffect(() => {
    fetchReport();
  }, [dateRange, startDate, endDate, hideStaffMeals]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/products-sold?range=${dateRange}&hideStaffMeals=${hideStaffMeals}`;
      if (startDate && endDate) {
        url = `/api/admin/products-sold?start=${startDate}&end=${endDate}&hideStaffMeals=${hideStaffMeals}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch (err) {
      console.error('Failed to fetch products report:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getSortedProducts = () => {
    if (!report) return [];

    let products = [...report.allProducts];

    // Filter by search
    if (searchQuery) {
      products = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    products.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'quantity':
          comparison = a.quantity - b.quantity;
          break;
        case 'revenue':
          comparison = a.revenue - b.revenue;
          break;
        case 'cogs':
          comparison = a.cogs - b.cogs;
          break;
        case 'profit':
          comparison = a.profit - b.profit;
          break;
        case 'margin':
          comparison = a.margin - b.margin;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return products;
  };

  const exportToCSV = () => {
    if (!report) return;

    const csvData = [
      ['Products Sold Report'],
      ['Generated:', new Date().toLocaleString()],
      ['Period:', `${report.dateRange.start.split('T')[0]} to ${report.dateRange.end.split('T')[0]}`],
      [''],
      ['Summary'],
      ['Total Products', report.summary.totalProducts],
      ['Total Items Sold', report.summary.totalItemsSold],
      ['Total Revenue', `RM ${report.summary.totalRevenue.toFixed(2)}`],
      ['Total COGS', `RM ${report.summary.totalCOGS.toFixed(2)}`],
      ['Total Profit', `RM ${report.summary.totalProfit.toFixed(2)}`],
      ['Overall Margin', `${report.summary.overallMargin.toFixed(1)}%`],
      [''],
      ['All Products'],
      ['Product', 'Qty Sold', 'Revenue', 'COGS', 'Profit', 'Margin %', 'Avg Price', 'Avg Profit'],
      ...getSortedProducts().map(p => [
        p.name,
        p.quantity,
        p.revenue.toFixed(2),
        p.cogs.toFixed(2),
        p.profit.toFixed(2),
        p.margin.toFixed(1),
        p.avgPrice.toFixed(2),
        p.avgProfit.toFixed(2),
      ]),
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `products-sold-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const MarginBadge = ({ margin }: { margin: number }) => {
    const colorClass = margin >= 60 ? 'text-green-600 bg-green-100' :
                      margin >= 40 ? 'text-yellow-600 bg-yellow-100' : 'text-red-600 bg-red-100';
    return (
      <span className={`px-2 py-1 rounded text-sm font-semibold ${colorClass}`}>
        {margin.toFixed(1)}%
      </span>
    );
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Loading products report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Failed to load products report</p>
        </div>
      </div>
    );
  }

  const sortedProducts = getSortedProducts();

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
              <h1 className="text-2xl font-bold">Products Sold Report</h1>
              <p className="text-sm text-gray-500">Analyze product performance and profitability</p>
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
                <option value="mtd">Month to Date</option>
                <option value="ytd">Year to Date</option>
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
              onClick={() => setHideStaffMeals(!hideStaffMeals)}
              className={`px-4 py-2 rounded-lg transition ${
                hideStaffMeals
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {hideStaffMeals ? '✓ Staff Meals Hidden' : 'Show Staff Meals'}
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Items Sold</p>
                <p className="text-2xl font-bold text-purple-600">
                  {report.summary.totalItemsSold}
                </p>
                <p className="text-xs text-gray-500">{report.summary.totalProducts} products</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  RM {report.summary.totalRevenue.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">Avg RM {report.summary.avgPricePerItem.toFixed(2)}/item</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Profit</p>
                <p className="text-2xl font-bold text-emerald-600">
                  RM {report.summary.totalProfit.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">Avg RM {report.summary.avgProfitPerItem.toFixed(2)}/item</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Percent className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Overall Margin</p>
                <p className={`text-2xl font-bold ${
                  report.summary.overallMargin >= 60 ? 'text-green-600' :
                  report.summary.overallMargin >= 40 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {report.summary.overallMargin.toFixed(1)}%
                </p>
                <p className="text-xs text-gray-500">COGS: RM {report.summary.totalCOGS.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Top Selling */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold">Top Selling</h3>
            </div>
            <div className="space-y-2">
              {report.highlights.topSelling.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="truncate flex-1">{i + 1}. {p.name}</span>
                  <span className="font-semibold text-purple-600 ml-2">{p.quantity} sold</span>
                </div>
              ))}
            </div>
          </div>

          {/* Highest Revenue */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-5 h-5 text-green-500" />
              <h3 className="font-semibold">Highest Revenue</h3>
            </div>
            <div className="space-y-2">
              {report.highlights.highestRevenue.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="truncate flex-1">{i + 1}. {p.name}</span>
                  <span className="font-semibold text-green-600 ml-2">RM {p.revenue.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Highest Profit */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h3 className="font-semibold">Highest Profit</h3>
            </div>
            <div className="space-y-2">
              {report.highlights.highestProfit.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="truncate flex-1">{i + 1}. {p.name}</span>
                  <span className="font-semibold text-emerald-600 ml-2">RM {p.profit.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Best Margin */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold">Best Margin (3+ sold)</h3>
            </div>
            <div className="space-y-2">
              {report.highlights.bestMargin.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="truncate flex-1">{i + 1}. {p.name}</span>
                  <MarginBadge margin={p.margin} />
                </div>
              ))}
            </div>
          </div>

          {/* Worst Margin */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-5 h-5 text-red-500" />
              <h3 className="font-semibold">Needs Attention (3+ sold)</h3>
            </div>
            <div className="space-y-2">
              {report.highlights.worstMargin.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="truncate flex-1">{i + 1}. {p.name}</span>
                  <MarginBadge margin={p.margin} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* All Products Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Package className="w-5 h-5" />
              All Products ({sortedProducts.length})
            </h2>
            <div className="flex-1 max-w-sm">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('name')}
                  >
                    Product{SortIcon({ field: 'name' })}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('quantity')}
                  >
                    Qty Sold{SortIcon({ field: 'quantity' })}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('revenue')}
                  >
                    Revenue{SortIcon({ field: 'revenue' })}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('cogs')}
                  >
                    COGS{SortIcon({ field: 'cogs' })}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('profit')}
                  >
                    Profit{SortIcon({ field: 'profit' })}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('margin')}
                  >
                    Margin{SortIcon({ field: 'margin' })}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Avg Price
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Avg Profit
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedProducts.map((product, index) => {
                  const isExpanded = expandedProducts.has(product.name);
                  return (
                    <React.Fragment key={index}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleExpanded(product.name)}
                      >
                        <td className="px-6 py-4 text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            )}
                            {product.name}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-semibold text-purple-600">
                          {product.quantity}
                        </td>
                        <td className="px-6 py-4 text-sm text-right">
                          RM {product.revenue.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-red-600">
                          RM {product.cogs.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-green-600">
                          RM {product.profit.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right">
                          <MarginBadge margin={product.margin} />
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          RM {product.avgPrice.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">
                          RM {product.avgProfit.toFixed(2)}
                        </td>
                      </tr>
                      {isExpanded && product.sales && product.sales.length > 0 && (
                        <tr>
                          <td colSpan={8} className="px-0 py-0 bg-gray-50">
                            <div className="px-8 py-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-gray-500 uppercase">
                                    <th className="px-3 py-2 text-left">Order #</th>
                                    <th className="px-3 py-2 text-left">Date</th>
                                    <th className="px-3 py-2 text-right">Qty</th>
                                    <th className="px-3 py-2 text-right">Unit Price</th>
                                    <th className="px-3 py-2 text-right">Unit COGS</th>
                                    <th className="px-3 py-2 text-right">Unit Profit</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {product.sales.map((sale, saleIndex) => (
                                    <tr key={saleIndex} className="hover:bg-gray-100">
                                      <td className="px-3 py-2 font-medium">
                                        <Link
                                          href={`/orders/${sale.orderId}`}
                                          className="text-blue-600 hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          #{sale.orderNumber}
                                        </Link>
                                      </td>
                                      <td className="px-3 py-2 text-gray-600">
                                        {new Date(sale.date).toLocaleDateString('en-MY', {
                                          day: 'numeric',
                                          month: 'short',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td className="px-3 py-2 text-right">{sale.quantity}</td>
                                      <td className="px-3 py-2 text-right">RM {sale.price.toFixed(2)}</td>
                                      <td className="px-3 py-2 text-right text-red-600">
                                        RM {sale.cogs.toFixed(2)}
                                      </td>
                                      <td className="px-3 py-2 text-right text-green-600">
                                        RM {(sale.price - sale.cogs).toFixed(2)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
