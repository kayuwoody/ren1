'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, ArrowUp, Package, Search, Download, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

interface StockMovement {
  id: string;
  itemType: 'product' | 'material';
  itemId: string;
  itemName: string;
  movementType: 'sale' | 'po_received' | 'stock_check' | 'manual_adjustment';
  quantityChange: number;
  stockBefore: number;
  stockAfter: number;
  referenceId?: string;
  referenceNote?: string;
  notes?: string;
  createdAt: string;
}

interface MovementSummary {
  totalMovements: number;
  salesDeductions: number;
  poAdditions: number;
  stockCheckAdjustments: number;
  manualAdjustments: number;
  itemsAffected: number;
}

interface TrackedItem {
  itemType: 'product' | 'material';
  itemId: string;
  itemName: string;
  movementCount: number;
}

type ViewMode = 'all' | 'item';

export default function StockUsagePage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [summary, setSummary] = useState<MovementSummary | null>(null);
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Filters
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedItem, setSelectedItem] = useState<TrackedItem | null>(null);
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('');
  const [itemTypeFilter, setItemTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [dateRange, setDateRange] = useState('30days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getDateRange = useCallback((): { start?: string; end?: string } => {
    if (startDate && endDate) {
      // Convert to UTC with GMT+8 offset
      const startUTC = new Date(Date.UTC(
        parseInt(startDate.split('-')[0]),
        parseInt(startDate.split('-')[1]) - 1,
        parseInt(startDate.split('-')[2]),
        0, 0, 0
      ) - (8 * 60 * 60 * 1000)).toISOString();

      const endUTC = new Date(Date.UTC(
        parseInt(endDate.split('-')[0]),
        parseInt(endDate.split('-')[1]) - 1,
        parseInt(endDate.split('-')[2]),
        23, 59, 59
      ) - (8 * 60 * 60 * 1000)).toISOString();

      return { start: startUTC, end: endUTC };
    }

    const now = new Date();
    // Convert to GMT+8
    const gmt8Now = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const todayGMT8 = new Date(Date.UTC(gmt8Now.getUTCFullYear(), gmt8Now.getUTCMonth(), gmt8Now.getUTCDate()));

    let start: Date;
    switch (dateRange) {
      case '7days':
        start = new Date(todayGMT8.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        start = new Date(todayGMT8.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90days':
        start = new Date(todayGMT8.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        return {};
      default:
        start = new Date(todayGMT8.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Convert start back to UTC (subtract GMT+8 offset)
    const startUTC = new Date(start.getTime() - (8 * 60 * 60 * 1000)).toISOString();
    return { start: startUTC };
  }, [dateRange, startDate, endDate]);

  // Fetch tracked items list
  useEffect(() => {
    fetchTrackedItems();
  }, []);

  // Fetch movements when filters change
  useEffect(() => {
    setPage(0);
    fetchMovements(0);
  }, [viewMode, selectedItem, movementTypeFilter, itemTypeFilter, searchQuery, dateRange, startDate, endDate]);

  const fetchTrackedItems = async () => {
    try {
      const res = await fetch('/api/admin/stock-usage?mode=items');
      if (res.ok) {
        const data = await res.json();
        setTrackedItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch tracked items:', err);
    }
  };

  const fetchMovements = async (pageOffset: number = page) => {
    setLoading(true);
    try {
      const range = getDateRange();

      if (viewMode === 'item' && selectedItem) {
        // Fetch item-specific history
        let url = `/api/admin/stock-usage?mode=item-history&itemType=${selectedItem.itemType}&itemId=${selectedItem.itemId}`;
        if (range.start) url += `&start=${encodeURIComponent(range.start)}`;
        if (range.end) url += `&end=${encodeURIComponent(range.end)}`;

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMovements(data.movements || []);
          setTotal(data.movements?.length || 0);
        }
      } else {
        // Fetch all movements with filters
        let url = `/api/admin/stock-usage?mode=list&limit=${pageSize}&offset=${pageOffset * pageSize}`;
        if (range.start) url += `&start=${encodeURIComponent(range.start)}`;
        if (range.end) url += `&end=${encodeURIComponent(range.end)}`;
        if (movementTypeFilter) url += `&movementType=${movementTypeFilter}`;
        if (itemTypeFilter) url += `&itemType=${itemTypeFilter}`;
        if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setMovements(data.movements || []);
          setTotal(data.total || 0);
          setSummary(data.summary || null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stock movements:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchMovements(newPage);
  };

  const selectItem = (item: TrackedItem) => {
    setSelectedItem(item);
    setViewMode('item');
    setPage(0);
  };

  const clearItemSelection = () => {
    setSelectedItem(null);
    setViewMode('all');
    setPage(0);
  };

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'sale': return 'Sale';
      case 'po_received': return 'PO Received';
      case 'stock_check': return 'Stock Check';
      case 'manual_adjustment': return 'Manual Adjustment';
      default: return type;
    }
  };

  const getMovementTypeColor = (type: string) => {
    switch (type) {
      case 'sale': return 'bg-red-100 text-red-700';
      case 'po_received': return 'bg-green-100 text-green-700';
      case 'stock_check': return 'bg-blue-100 text-blue-700';
      case 'manual_adjustment': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    // Convert to GMT+8
    const gmt8 = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    return gmt8.toLocaleString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC', // Already adjusted to GMT+8
    });
  };

  const exportToCSV = () => {
    const csvData = [
      ['Stock Usage Report'],
      ['Generated:', new Date().toLocaleString()],
      selectedItem ? ['Item:', `${selectedItem.itemName} (${selectedItem.itemType})`] : [],
      [''],
      ['Date', 'Item', 'Type', 'Movement', 'Change', 'Stock Before', 'Stock After', 'Reference', 'Notes'],
      ...movements.map(m => [
        formatDate(m.createdAt),
        m.itemName,
        m.itemType,
        getMovementTypeLabel(m.movementType),
        m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange.toString(),
        m.stockBefore.toString(),
        m.stockAfter.toString(),
        m.referenceNote || '',
        m.notes || '',
      ]),
    ].filter(row => row.length > 0);

    const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-usage-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredTrackedItems = trackedItems.filter(item =>
    item.itemName.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const totalPages = Math.ceil(total / pageSize);

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
              <h1 className="text-2xl font-bold">Stock Usage Report</h1>
              <p className="text-sm text-gray-500">Track all stock level changes across sales, POs, and stock checks</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* Summary Stats */}
        {summary && viewMode === 'all' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Total Movements</p>
              <p className="text-xl font-bold">{summary.totalMovements}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Items Affected</p>
              <p className="text-xl font-bold text-purple-600">{summary.itemsAffected}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Sale Deductions</p>
              <p className="text-xl font-bold text-red-600">{summary.salesDeductions}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">PO Received</p>
              <p className="text-xl font-bold text-green-600">{summary.poAdditions}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Stock Checks</p>
              <p className="text-xl font-bold text-blue-600">{summary.stockCheckAdjustments}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-500">Manual Adj.</p>
              <p className="text-xl font-bold text-yellow-600">{summary.manualAdjustments}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col gap-4">
            {/* Row 1: Date range + item selector toggle */}
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                <select
                  value={dateRange}
                  onChange={(e) => {
                    setDateRange(e.target.value);
                    if (e.target.value !== 'custom') {
                      setStartDate('');
                      setEndDate('');
                    }
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
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
                onClick={exportToCSV}
                disabled={movements.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>

            {/* Row 2: Movement type + item type + search (only in all mode) */}
            {viewMode === 'all' && (
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Movement Type</label>
                  <select
                    value={movementTypeFilter}
                    onChange={(e) => setMovementTypeFilter(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Types</option>
                    <option value="sale">Sale</option>
                    <option value="po_received">PO Received</option>
                    <option value="stock_check">Stock Check</option>
                    <option value="manual_adjustment">Manual Adjustment</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Item Type</label>
                  <select
                    value={itemTypeFilter}
                    onChange={(e) => setItemTypeFilter(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Items</option>
                    <option value="product">Products Only</option>
                    <option value="material">Materials Only</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Search Item Name</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Selected item indicator */}
            {viewMode === 'item' && selectedItem && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <Filter className="w-5 h-5 text-blue-600" />
                <div className="flex-1">
                  <span className="font-semibold text-blue-800">{selectedItem.itemName}</span>
                  <span className="ml-2 text-sm text-blue-600">
                    ({selectedItem.itemType === 'product' ? 'Product' : 'Material'})
                  </span>
                </div>
                <button
                  onClick={clearItemSelection}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                  View All Items
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Item Picker Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Select Item
                </h3>
                <div className="mt-2 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Filter items..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto divide-y">
                {/* All items option */}
                <button
                  onClick={clearItemSelection}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                    viewMode === 'all' ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                >
                  <p className="font-medium text-sm">All Items</p>
                  <p className="text-xs text-gray-500">View all stock movements</p>
                </button>

                {filteredTrackedItems.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">
                    {trackedItems.length === 0 ? 'No stock movements recorded yet' : 'No matching items'}
                  </div>
                )}

                {filteredTrackedItems.map((item) => (
                  <button
                    key={`${item.itemType}-${item.itemId}`}
                    onClick={() => selectItem(item)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition ${
                      selectedItem?.itemId === item.itemId && selectedItem?.itemType === item.itemType
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.itemName}</p>
                        <p className="text-xs text-gray-500">
                          {item.itemType === 'product' ? 'Product' : 'Material'}
                        </p>
                      </div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                        {item.movementCount}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content - Movements Table */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {viewMode === 'item' && selectedItem
                    ? `Stock History: ${selectedItem.itemName}`
                    : `All Stock Movements (${total})`
                  }
                </h2>
              </div>

              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading stock movements...</div>
              ) : movements.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No stock movements found</p>
                  <p className="text-sm mt-1">Stock movements will appear here as sales, PO receiving, and stock checks occur.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          {viewMode === 'all' && (
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          )}
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Before</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">After</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {movements.map((movement) => (
                          <tr key={movement.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {formatDate(movement.createdAt)}
                            </td>
                            {viewMode === 'all' && (
                              <td className="px-4 py-3 text-sm">
                                <button
                                  onClick={() => selectItem({
                                    itemType: movement.itemType,
                                    itemId: movement.itemId,
                                    itemName: movement.itemName,
                                    movementCount: 0,
                                  })}
                                  className="font-medium text-blue-600 hover:underline"
                                >
                                  {movement.itemName}
                                </button>
                                <span className="ml-1 text-xs text-gray-400">
                                  ({movement.itemType === 'product' ? 'P' : 'M'})
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getMovementTypeColor(movement.movementType)}`}>
                                {getMovementTypeLabel(movement.movementType)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 ${
                                movement.quantityChange > 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {movement.quantityChange > 0 ? (
                                  <ArrowUp className="w-3 h-3" />
                                ) : (
                                  <ArrowDown className="w-3 h-3" />
                                )}
                                {movement.quantityChange > 0 ? '+' : ''}{movement.quantityChange}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-500">
                              {movement.stockBefore}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              {movement.stockAfter}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                              {movement.referenceNote || movement.notes || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination (only for all mode) */}
                  {viewMode === 'all' && totalPages > 1 && (
                    <div className="p-4 border-t flex items-center justify-between">
                      <p className="text-sm text-gray-500">
                        Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePageChange(page - 1)}
                          disabled={page === 0}
                          className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-sm text-gray-600">
                          Page {page + 1} of {totalPages}
                        </span>
                        <button
                          onClick={() => handlePageChange(page + 1)}
                          disabled={page >= totalPages - 1}
                          className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
