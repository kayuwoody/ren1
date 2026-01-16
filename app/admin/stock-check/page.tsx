'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Download, Save, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Search, RefreshCw, History, Clock } from 'lucide-react';

interface StockCheckItem {
  id: string;
  type: 'product' | 'material';
  name: string;
  sku?: string;
  category: string;
  supplier: string;
  currentStock: number;
  unit: string;
  lowStockThreshold?: number;
}

interface StockInput {
  countedStock: string;
  note: string;
}

interface StockCheckLog {
  id: string;
  checkDate: string;
  itemsChecked: number;
  itemsAdjusted: number;
  notes?: string;
  createdAt: string;
}

interface StockCheckLogItem {
  id: string;
  itemType: 'product' | 'material';
  itemId: string;
  itemName: string;
  supplier?: string;
  previousStock: number;
  countedStock: number;
  difference: number;
  unit: string;
  note?: string;
  wcSynced: boolean;
}

export default function StockCheckPage() {
  const [items, setItems] = useState<StockCheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockInputs, setStockInputs] = useState<Record<string, StockInput>>({});
  const [collapsedSuppliers, setCollapsedSuppliers] = useState<Set<string>>(new Set());
  const [showOnlyDiff, setShowOnlyDiff] = useState(false);
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string } | null>(null);
  const [logs, setLogs] = useState<StockCheckLog[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [selectedLog, setSelectedLog] = useState<{ log: StockCheckLog; items: StockCheckLogItem[] } | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/stock-check');
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        // Initialize stock inputs
        const inputs: Record<string, StockInput> = {};
        for (const item of data.items) {
          inputs[item.id] = { countedStock: '', note: '' };
        }
        setStockInputs(inputs);
      }
    } catch (err) {
      console.error('Failed to fetch items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/admin/stock-check/logs?limit=10');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const fetchLogDetails = async (logId: string) => {
    try {
      const res = await fetch(`/api/admin/stock-check/logs/${logId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedLog(data.log);
      }
    } catch (err) {
      console.error('Failed to fetch log details:', err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (showLogs && logs.length === 0) {
      fetchLogs();
    }
  }, [showLogs, logs.length, fetchLogs]);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const res = await fetch('/api/admin/stock-check/pdf');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Stock-Check-${new Date().toISOString().split('T')[0]}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Failed to download PDF:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleInputChange = (itemId: string, field: 'countedStock' | 'note', value: string) => {
    setStockInputs(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
      },
    }));
  };

  const getItemsWithChanges = () => {
    return items.filter(item => {
      const input = stockInputs[item.id];
      if (!input || input.countedStock === '') return false;
      const countedNum = parseFloat(input.countedStock);
      return !isNaN(countedNum);
    });
  };

  const handleUpdateStock = async () => {
    const itemsToUpdate = getItemsWithChanges();

    if (itemsToUpdate.length === 0) {
      setUpdateResult({ success: false, message: 'No items have counted stock entered' });
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to update stock for ${itemsToUpdate.length} item(s)?\n\n` +
      `This will overwrite the current system stock with your counted values.`
    );

    if (!confirmed) return;

    setSaving(true);
    setUpdateResult(null);

    try {
      const updates = itemsToUpdate.map(item => ({
        id: item.id,
        type: item.type,
        countedStock: parseFloat(stockInputs[item.id].countedStock),
        note: stockInputs[item.id].note || undefined,
      }));

      const res = await fetch('/api/admin/stock-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });

      const data = await res.json();

      if (res.ok) {
        setUpdateResult({ success: true, message: data.message });
        // Clear inputs for successfully updated items
        const newInputs = { ...stockInputs };
        for (const result of data.results) {
          if (result.success) {
            newInputs[result.id] = { countedStock: '', note: '' };
          }
        }
        setStockInputs(newInputs);
        // Refresh items to show updated stock
        await fetchItems();
        // Refresh logs if visible
        if (showLogs) {
          await fetchLogs();
        }
      } else {
        setUpdateResult({ success: false, message: data.error || 'Update failed' });
      }
    } catch (err) {
      setUpdateResult({ success: false, message: 'Failed to update stock' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSupplierCollapse = (supplier: string) => {
    setCollapsedSuppliers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(supplier)) {
        newSet.delete(supplier);
      } else {
        newSet.add(supplier);
      }
      return newSet;
    });
  };

  // Group items by supplier
  const groupedItems = items.reduce((acc, item) => {
    const supplier = item.supplier;
    if (!acc[supplier]) {
      acc[supplier] = [];
    }
    acc[supplier].push(item);
    return acc;
  }, {} as Record<string, StockCheckItem[]>);

  // Sort suppliers
  const sortedSuppliers = Object.keys(groupedItems).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  // Filter items based on search
  const filterItems = (supplierItems: StockCheckItem[]) => {
    let filtered = supplierItems;

    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (showOnlyDiff) {
      filtered = filtered.filter(item => {
        const input = stockInputs[item.id];
        if (!input || input.countedStock === '') return false;
        const countedNum = parseFloat(input.countedStock);
        return !isNaN(countedNum) && countedNum !== item.currentStock;
      });
    }

    return filtered;
  };

  const getDiffDisplay = (item: StockCheckItem) => {
    const input = stockInputs[item.id];
    if (!input || input.countedStock === '') return null;

    const countedNum = parseFloat(input.countedStock);
    if (isNaN(countedNum)) return null;

    const diff = countedNum - item.currentStock;
    if (diff === 0) return <span className="text-gray-400">-</span>;

    const colorClass = diff > 0 ? 'text-green-600' : 'text-red-600';
    const prefix = diff > 0 ? '+' : '';
    return (
      <span className={`font-semibold ${colorClass}`}>
        {prefix}{diff.toFixed(item.unit === 'pcs' ? 0 : 1)}
      </span>
    );
  };

  const changesCount = getItemsWithChanges().length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <p>Loading stock check...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Stock Check</h1>
                <p className="text-sm text-gray-500">Count physical inventory and update stock levels</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchItems}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {downloadingPdf ? 'Generating...' : 'Download PDF'}
              </button>
              <button
                onClick={handleUpdateStock}
                disabled={saving || changesCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : `Update Stock (${changesCount})`}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Result message */}
        {updateResult && (
          <div className={`p-4 rounded-lg flex items-center gap-3 ${
            updateResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {updateResult.success ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            {updateResult.message}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Items
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or SKU..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <button
              onClick={() => setShowOnlyDiff(!showOnlyDiff)}
              className={`px-4 py-2 rounded-lg transition ${
                showOnlyDiff
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {showOnlyDiff ? 'Showing Differences Only' : 'Show All Items'}
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Total Items</p>
            <p className="text-2xl font-bold text-gray-800">{items.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Suppliers</p>
            <p className="text-2xl font-bold text-blue-600">{sortedSuppliers.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Items Counted</p>
            <p className="text-2xl font-bold text-green-600">{changesCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-500">Low Stock Items</p>
            <p className="text-2xl font-bold text-red-600">
              {items.filter(i => i.lowStockThreshold && i.currentStock <= i.lowStockThreshold).length}
            </p>
          </div>
        </div>

        {/* Items by Supplier */}
        <div className="space-y-4">
          {sortedSuppliers.map(supplier => {
            const supplierItems = filterItems(groupedItems[supplier]);
            if (supplierItems.length === 0 && searchQuery) return null;

            const isCollapsed = collapsedSuppliers.has(supplier);
            const supplierCounted = supplierItems.filter(item => {
              const input = stockInputs[item.id];
              return input && input.countedStock !== '';
            }).length;

            return (
              <div key={supplier} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Supplier Header */}
                <button
                  onClick={() => toggleSupplierCollapse(supplier)}
                  className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-lg">{supplier}</span>
                    <span className="text-sm text-gray-500">
                      ({supplierItems.length} items{supplierCounted > 0 && `, ${supplierCounted} counted`})
                    </span>
                  </div>
                  {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                </button>

                {/* Items Table */}
                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-y">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Unit</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">System Stock</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32">Counted</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-20">Diff</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {supplierItems.map(item => {
                          const isLowStock = item.lowStockThreshold && item.currentStock <= item.lowStockThreshold;
                          const input = stockInputs[item.id] || { countedStock: '', note: '' };

                          return (
                            <tr key={item.id} className={`hover:bg-gray-50 ${isLowStock ? 'bg-red-50' : ''}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 text-xs rounded ${
                                    item.type === 'product' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {item.type === 'product' ? 'P' : 'M'}
                                  </span>
                                  <div>
                                    <p className="font-medium text-sm">{item.name}</p>
                                    {item.sku && <p className="text-xs text-gray-500">{item.sku}</p>}
                                  </div>
                                  {isLowStock && (
                                    <span title="Low stock">
                                      <AlertTriangle className="w-4 h-4 text-red-500" />
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{item.category}</td>
                              <td className="px-4 py-3 text-sm text-center text-gray-600">{item.unit}</td>
                              <td className="px-4 py-3 text-sm text-right font-semibold">
                                {item.currentStock.toFixed(item.unit === 'pcs' ? 0 : 1)}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  step={item.unit === 'pcs' ? 1 : 0.1}
                                  min="0"
                                  value={input.countedStock}
                                  onChange={(e) => handleInputChange(item.id, 'countedStock', e.target.value)}
                                  placeholder="-"
                                  className="w-full px-3 py-1.5 border rounded text-center text-sm focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-center">
                                {getDiffDisplay(item)}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={input.note}
                                  onChange={(e) => handleInputChange(item.id, 'note', e.target.value)}
                                  placeholder="Optional note..."
                                  className="w-full px-3 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stock Check History */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition"
          >
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-gray-600" />
              <span className="font-semibold text-lg">Stock Check History</span>
              {logs.length > 0 && (
                <span className="text-sm text-gray-500">({logs.length} recent)</span>
              )}
            </div>
            {showLogs ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          {showLogs && (
            <div className="p-4">
              {loadingLogs ? (
                <p className="text-gray-500 text-center py-4">Loading history...</p>
              ) : logs.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No stock check history yet</p>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => (
                    <div
                      key={log.id}
                      className="border rounded-lg overflow-hidden"
                    >
                      <button
                        onClick={() => {
                          if (selectedLog?.log.id === log.id) {
                            setSelectedLog(null);
                          } else {
                            fetchLogDetails(log.id);
                          }
                        }}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition"
                      >
                        <div className="flex items-center gap-4">
                          <Clock className="w-4 h-4 text-gray-400" />
                          <div className="text-left">
                            <p className="font-medium">
                              {new Date(log.checkDate).toLocaleDateString('en-MY', {
                                weekday: 'short',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            <p className="text-sm text-gray-500">
                              {log.itemsChecked} items checked, {log.itemsAdjusted} adjusted
                            </p>
                          </div>
                        </div>
                        {selectedLog?.log.id === log.id ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {selectedLog?.log.id === log.id && selectedLog.items && (
                        <div className="border-t bg-gray-50 p-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 uppercase">
                                <th className="text-left pb-2">Item</th>
                                <th className="text-right pb-2">Previous</th>
                                <th className="text-right pb-2">Counted</th>
                                <th className="text-right pb-2">Diff</th>
                                <th className="text-left pb-2 pl-4">Note</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {selectedLog.items.map(item => (
                                <tr key={item.id}>
                                  <td className="py-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 text-xs rounded ${
                                        item.itemType === 'product' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                      }`}>
                                        {item.itemType === 'product' ? 'P' : 'M'}
                                      </span>
                                      <span>{item.itemName}</span>
                                      {item.wcSynced && (
                                        <span className="text-xs text-green-600">(WC)</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 text-right text-gray-500">
                                    {item.previousStock.toFixed(item.unit === 'pcs' ? 0 : 1)} {item.unit}
                                  </td>
                                  <td className="py-2 text-right font-medium">
                                    {item.countedStock.toFixed(item.unit === 'pcs' ? 0 : 1)} {item.unit}
                                  </td>
                                  <td className={`py-2 text-right font-semibold ${
                                    item.difference > 0 ? 'text-green-600' : item.difference < 0 ? 'text-red-600' : 'text-gray-400'
                                  }`}>
                                    {item.difference > 0 ? '+' : ''}{item.difference.toFixed(item.unit === 'pcs' ? 0 : 1)}
                                  </td>
                                  <td className="py-2 pl-4 text-gray-500 truncate max-w-[150px]">
                                    {item.note || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom action bar for mobile */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 flex gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
          <button
            onClick={handleUpdateStock}
            disabled={saving || changesCount === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Update ({changesCount})
          </button>
        </div>

        {/* Spacer for bottom bar on mobile */}
        <div className="md:hidden h-20" />
      </div>
    </div>
  );
}
