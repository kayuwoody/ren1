'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Edit2, Trash2, Package, Search, ChefHat } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface Product {
  id: string;
  wcId?: number;
  name: string;
  sku: string;
  category: string;
  currentPrice: number;
  supplierCost: number;
  unitCost: number;
  comboPriceOverride?: number;
  supplier?: string;
  quantityPerCarton?: number | null;
  imageUrl?: string;
  stockQuantity?: number | null;
  manageStock: boolean;
}

export default function ProductsPage() {
  const { branchFetch } = useBranch();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await branchFetch('/api/admin/products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteProduct(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    try {
      const res = await branchFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete product');
        return;
      }
      await fetchProducts();
    } catch (error) {
      console.error('Failed to delete product:', error);
      alert('Failed to delete product.');
    }
  }

  const categories = Array.from(new Set(products.map(p => p.category))).sort();

  const filtered = products.filter(p => {
    const categoryMatch = filterCategory === 'all' || p.category === filterCategory;
    const searchMatch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Products</h1>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-500">Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Products</h1>
              <p className="text-gray-600 text-sm">{products.length} products total</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/recipes"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <ChefHat className="w-5 h-5" />
              Recipes
            </Link>
            <button
              onClick={() => { setEditingProduct(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-5 h-5" />
              Add Product
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border rounded-lg"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                filterCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-4 py-2 rounded-lg capitalize whitespace-nowrap ${
                  filterCategory === cat ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Price (RM)</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">COGS (RM)</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Margin</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((product) => {
                  const cogs = product.supplierCost + product.unitCost;
                  const margin = product.currentPrice > 0
                    ? ((product.currentPrice - cogs) / product.currentPrice * 100)
                    : 0;
                  return (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="w-10 h-10 rounded object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{product.name}</div>
                            {product.manageStock && (
                              <div className="text-xs text-gray-500">
                                Stock: {product.stockQuantity ?? 0}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono">{product.sku}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-1 rounded text-xs font-medium capitalize bg-gray-100 text-gray-700">
                          {product.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {product.currentPrice.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {cogs > 0 ? cogs.toFixed(2) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cogs > 0 ? (
                          <span className={margin >= 50 ? 'text-green-600' : margin >= 30 ? 'text-yellow-600' : 'text-red-600'}>
                            {margin.toFixed(0)}%
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{product.supplier || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href="/admin/recipes"
                            className="p-2 text-amber-600 hover:bg-amber-50 rounded"
                            title="Edit Recipe"
                          >
                            <ChefHat className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => { setEditingProduct(product); setShowModal(true); }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteProduct(product.id, product.name)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                            title="Delete Product"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              {searchQuery || filterCategory !== 'all' ? (
                <p>No products match your search/filter.</p>
              ) : (
                <p>No products yet. Add your first product to get started.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <ProductModal
          product={editingProduct}
          existingCategories={categories}
          onClose={() => { setShowModal(false); setEditingProduct(null); }}
          onSave={() => { setShowModal(false); setEditingProduct(null); fetchProducts(); }}
        />
      )}
    </div>
  );
}

function ProductModal({
  product,
  existingCategories,
  onClose,
  onSave,
}: {
  product: Product | null;
  existingCategories: string[];
  onClose: () => void;
  onSave: () => void;
}) {
  const { branchFetch } = useBranch();
  const [saving, setSaving] = useState(false);
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.sku || '',
    category: product?.category || '',
    basePrice: product?.currentPrice ?? '',
    manageStock: product?.manageStock ?? false,
    imageUrl: product?.imageUrl || '',
    supplier: product?.supplier || '',
    quantityPerCarton: product?.quantityPerCarton ?? '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = product
        ? `/api/admin/products/${product.id}`
        : '/api/admin/products';

      const method = product ? 'PUT' : 'POST';

      const res = await branchFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          basePrice: parseFloat(String(formData.basePrice)) || 0,
          quantityPerCarton: formData.quantityPerCarton ? parseInt(String(formData.quantityPerCarton)) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to save product');
        return;
      }

      onSave();
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., Iced Latte"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SKU *
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., ICED-LATTE-01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              {!useCustomCategory && existingCategories.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="flex-1 px-3 py-2 border rounded-lg"
                    required
                  >
                    <option value="">-- Select --</option>
                    {existingCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setUseCustomCategory(true); setFormData({ ...formData, category: '' }); }}
                    className="px-3 py-2 text-sm text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50"
                  >
                    New
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value.toLowerCase() })}
                    className="flex-1 px-3 py-2 border rounded-lg"
                    placeholder="e.g., beverage"
                    required
                  />
                  {existingCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setUseCustomCategory(false)}
                      className="px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                    >
                      Existing
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selling Price (RM) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="12.90"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier
              </label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., ABC Supplies Sdn Bhd"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Image URL
              </label>
              <input
                type="text"
                value={formData.imageUrl}
                onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Qty Per Carton
              </label>
              <input
                type="number"
                min="1"
                value={formData.quantityPerCarton}
                onChange={(e) => setFormData({ ...formData, quantityPerCarton: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="24"
              />
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="manageStock"
                checked={formData.manageStock}
                onChange={(e) => setFormData({ ...formData, manageStock: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="manageStock" className="text-sm font-medium text-gray-700">
                Track inventory for this product
              </label>
            </div>
          </div>

          {product && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                Supplier cost and recipe cost are managed on the{' '}
                <Link href="/admin/recipes" className="text-blue-600 underline">Recipes page</Link>.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Saving...' : (product ? 'Update Product' : 'Add Product')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
