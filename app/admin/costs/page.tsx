'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, Edit2, DollarSign, TrendingUp, Package, ChefHat } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/products/costs');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
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

      // Refresh products list
      await fetchProducts();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Product Costs (COGS)</h1>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-500">Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  const totalProducts = products.length;
  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => sum + p.grossMargin, 0) / products.length
    : 0;
  const productsNeedingCost = products.filter(p => p.unitCost === 0).length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Product Costs (COGS)</h1>
          </div>

          <div className="flex gap-3">
            <Link
              href="/admin/materials"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Package className="w-5 h-5" />
              Manage Materials
            </Link>
            <Link
              href="/admin/recipes"
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <ChefHat className="w-5 h-5" />
              Build Recipes
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-500">Total Products</p>
                <p className="text-2xl font-bold">{totalProducts}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-sm text-gray-500">Avg Gross Margin</p>
                <p className={`text-2xl font-bold ${getMarginColor(avgMargin)}`}>
                  {avgMargin.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <Edit2 className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-gray-500">Needs Cost Setup</p>
                <p className="text-2xl font-bold text-orange-600">
                  {productsNeedingCost}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        {productsNeedingCost > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-yellow-800">
              <strong>Action Required:</strong> {productsNeedingCost} product(s) don't have a cost set yet.
              Click the edit icon to set the unit cost (COGS) for each product.
            </p>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Price</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Unit Cost</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Profit</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Margin</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{product.name}</p>
                      <p className="text-sm text-gray-500">{product.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getCategoryColor(product.category)}`}>
                      {product.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    RM {product.currentPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === product.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-gray-500">RM</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-20 px-2 py-1 border rounded text-right"
                          autoFocus
                          disabled={saving}
                        />
                      </div>
                    ) : (
                      <span className={product.unitCost === 0 ? 'text-red-600 font-medium' : ''}>
                        RM {product.unitCost.toFixed(2)}
                        {product.unitCost === 0 && ' ⚠️'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    RM {product.grossProfit.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${getMarginColor(product.grossMargin)}`}>
                      {product.grossMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {editingId === product.id ? (
                        <>
                          <button
                            onClick={() => saveEdit(product.id)}
                            disabled={saving}
                            className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-1"
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={saving}
                            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50 text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(product)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit cost"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {products.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No products found. Sync products from WooCommerce first.</p>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">About COGS (Cost of Goods Sold)</h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li><strong>Unit Cost:</strong> Total cost to make/serve one unit (ingredients + packaging + consumables)</li>
            <li><strong>Gross Profit:</strong> Selling price minus unit cost</li>
            <li><strong>Gross Margin:</strong> Profit as a percentage of selling price</li>
            <li>Costs are stored locally and used for profit calculations on all orders</li>
            <li>WooCommerce only stores product prices - COGS is managed here</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
