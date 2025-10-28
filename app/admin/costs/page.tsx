'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Edit2, DollarSign, TrendingUp, Package, ChefHat, Search, RefreshCw } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentPrice: number;
  unitCost: number;
  grossProfit: number;
  grossMargin: number;
  stockQuantity: number;
  costBreakdown?: any;
}

export default function CostsManagementPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    if (productSearch) {
      const filtered = products.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [productSearch, products]);

  async function fetchProducts() {
    try {
      setSyncing(true);
      const res = await fetch('/api/admin/products/costs');
      const data = await res.json();
      setProducts(data.products || []);
      setFilteredProducts(data.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }

  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditValue(product.unitCost.toFixed(2));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue('');
  }

  async function saveEdit(productId: string) {
    const newCost = parseFloat(editValue);
    if (isNaN(newCost) || newCost < 0) {
      alert('Please enter a valid cost');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/products/${productId}/cost`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitCost: newCost }),
      });

      if (!res.ok) {
        throw new Error('Failed to update cost');
      }

      alert('Cost updated successfully!');

      // Refresh products list
      await fetchProducts();

      // Update selected product with the new data
      if (selectedProduct) {
        const updated = products.find(p => p.id === productId);
        if (updated) {
          setSelectedProduct(updated);
        }
      }

      setEditingId(null);
      setEditValue('');
    } catch (error) {
      console.error('Failed to save cost:', error);
      alert('Failed to update cost. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function getCategoryColor(category: string) {
    switch (category) {
      case 'beverage': return 'bg-blue-100 text-blue-800';
      case 'food': return 'bg-orange-100 text-orange-800';
      case 'merchandise': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  function getMarginColor(margin: number) {
    if (margin >= 60) return 'text-green-600';
    if (margin >= 40) return 'text-yellow-600';
    return 'text-red-600';
  }

  const totalProducts = products.length;
  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => sum + p.grossMargin, 0) / products.length
    : 0;
  const productsNeedingCost = products.filter(p => p.unitCost === 0).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <DollarSign className="w-7 h-7 text-green-600" />
                Product Costs (COGS)
              </h1>
              <p className="text-sm text-gray-500">Manage unit costs and view profit margins</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Product List Sidebar */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={fetchProducts}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from WooCommerce'}
            </button>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <div className="bg-gray-50 rounded p-2">
                <p className="text-xs text-gray-500">Total</p>
                <p className="font-semibold">{totalProducts}</p>
              </div>
              <div className="bg-gray-50 rounded p-2">
                <p className="text-xs text-gray-500">Avg Margin</p>
                <p className={`font-semibold ${getMarginColor(avgMargin)}`}>
                  {avgMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                <p>Loading products...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p>No products found</p>
                <p className="text-xs mt-1">Click sync to load from WooCommerce</p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                      selectedProduct?.id === product.id ? 'bg-green-50 border-l-4 border-green-500' : ''
                    }`}
                  >
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-600">{product.sku}</div>
                    <div className="text-sm mt-1 flex items-center justify-between">
                      <span className="text-gray-600">COGS: </span>
                      <span className={`font-semibold ${product.unitCost === 0 ? 'text-red-600' : ''}`}>
                        RM {product.unitCost.toFixed(2)}
                        {product.unitCost === 0 && ' ⚠️'}
                      </span>
                    </div>
                    <div className="text-sm mt-1 flex items-center justify-between">
                      <span className="text-gray-600">Margin: </span>
                      <span className={`font-semibold ${getMarginColor(product.grossMargin)}`}>
                        {product.grossMargin.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content - Product Details */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedProduct ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <DollarSign className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Select a product to view and edit its cost details</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Product Info Card */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedProduct.name}</h2>
                    <p className="text-sm text-gray-500">{selectedProduct.sku}</p>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium mt-2 ${getCategoryColor(selectedProduct.category)}`}>
                      {selectedProduct.category}
                    </span>
                  </div>
                  <Link
                    href="/admin/recipes"
                    className="flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm"
                  >
                    <ChefHat className="w-4 h-4" />
                    Edit Recipe
                  </Link>
                </div>

                {/* Financial Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-sm text-blue-700 font-medium">Selling Price</p>
                    <p className="text-2xl font-bold text-blue-900">
                      RM {selectedProduct.currentPrice.toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-4">
                    <p className="text-sm text-orange-700 font-medium">Unit Cost (COGS)</p>
                    {editingId === selectedProduct.id ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-gray-500">RM</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-24 px-2 py-1 border rounded text-right font-bold text-xl"
                          autoFocus
                          disabled={saving}
                        />
                      </div>
                    ) : (
                      <p className={`text-2xl font-bold ${selectedProduct.unitCost === 0 ? 'text-red-600' : 'text-orange-900'}`}>
                        RM {selectedProduct.unitCost.toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-sm text-green-700 font-medium">Gross Profit</p>
                    <p className="text-2xl font-bold text-green-900">
                      RM {selectedProduct.grossProfit.toFixed(2)}
                    </p>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4">
                    <p className="text-sm text-purple-700 font-medium">Gross Margin</p>
                    <p className={`text-2xl font-bold ${getMarginColor(selectedProduct.grossMargin)}`}>
                      {selectedProduct.grossMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Edit Actions */}
                <div className="mt-6 pt-6 border-t">
                  {editingId === selectedProduct.id ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => saveEdit(selectedProduct.id)}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold"
                      >
                        <Save className="w-5 h-5" />
                        {saving ? 'Saving...' : 'Save Unit Cost'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(selectedProduct)}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                    >
                      <Edit2 className="w-5 h-5" />
                      Edit Unit Cost
                    </button>
                  )}
                </div>
              </div>

              {/* Help Text */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">About COGS (Cost of Goods Sold)</h3>
                <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                  <li><strong>Unit Cost:</strong> Total cost to make/serve one unit (ingredients + packaging + consumables)</li>
                  <li><strong>Gross Profit:</strong> Selling price minus unit cost (RM {selectedProduct.currentPrice.toFixed(2)} - RM {selectedProduct.unitCost.toFixed(2)} = RM {selectedProduct.grossProfit.toFixed(2)})</li>
                  <li><strong>Gross Margin:</strong> Profit as a percentage of selling price ({((selectedProduct.grossProfit / selectedProduct.currentPrice) * 100).toFixed(1)}%)</li>
                  <li>You can manually set the cost here, or use the <ChefHat className="w-3 h-3 inline" /> Recipe Builder to calculate it automatically</li>
                  <li>Costs are stored locally and used for profit calculations on all orders</li>
                </ul>
              </div>

              {selectedProduct.unitCost === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Action Required:</strong> This product doesn't have a cost set yet.
                    Click "Edit Unit Cost" to set it manually, or use the Recipe Builder to calculate it automatically.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
