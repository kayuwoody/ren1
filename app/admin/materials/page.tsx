'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Edit2, Trash2, Package, AlertCircle, PackagePlus } from 'lucide-react';
import { useBranch } from '@/context/branchContext';

interface Material {
  id: string;
  name: string;
  category: 'ingredient' | 'packaging' | 'consumable';
  purchaseUnit: string;
  purchaseQuantity: number;
  purchaseCost: number;
  costPerUnit: number;
  stockQuantity: number;
  lowStockThreshold: number;
  supplier?: string;
  createdAt: string;
  updatedAt: string;
}

export default function MaterialsPage() {
  const { branchFetch } = useBranch();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<'all' | 'ingredient' | 'packaging' | 'consumable'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [addStockMaterial, setAddStockMaterial] = useState<Material | null>(null);

  useEffect(() => {
    fetchMaterials();
  }, [filterCategory]);

  async function fetchMaterials() {
    try {
      setLoading(true);
      const url = filterCategory === 'all'
        ? '/api/admin/materials'
        : `/api/admin/materials?category=${filterCategory}`;
      const res = await branchFetch(url);
      const data = await res.json();
      setMaterials(data.materials || []);
    } catch (error) {
      console.error('Failed to fetch materials:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteMaterial(id: string, name: string) {
    if (!confirm(`Delete ${name}? This will affect all recipes using this material.`)) {
      return;
    }

    try {
      const res = await branchFetch(`/api/admin/materials/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete material');
      }

      await fetchMaterials();
    } catch (error) {
      console.error('Failed to delete material:', error);
      alert('Failed to delete material. It may be used in recipes.');
    }
  }

  function getCategoryColor(category: string) {
    switch (category) {
      case 'ingredient': return 'bg-green-100 text-green-800';
      case 'packaging': return 'bg-blue-100 text-blue-800';
      case 'consumable': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/admin" className="text-blue-600 hover:text-blue-800">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-3xl font-bold">Materials & Ingredients</h1>
          </div>
          <div className="text-center py-12">
            <p className="text-gray-500">Loading materials...</p>
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
            <h1 className="text-3xl font-bold">Materials & Ingredients</h1>
          </div>

          <button
            onClick={() => {
              setEditingMaterial(null);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            Add Material
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">About Materials</p>
              <p>
                Materials are ingredients and packaging items you purchase. When you update a material's price,
                all product recipes using it will automatically recalculate their COGS.
              </p>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-6">
          {(['all', 'ingredient', 'packaging', 'consumable'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-2 rounded capitalize ${
                filterCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Materials Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Material</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Purchase</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Cost Per Unit</th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Stock</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {materials.map((material) => (
                <tr key={material.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium">{material.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${getCategoryColor(material.category)}`}>
                      {material.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm">
                      {material.purchaseQuantity}{material.purchaseUnit}
                    </div>
                    <div className="text-xs text-gray-500">
                      @ RM {material.purchaseCost.toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold">
                    RM {material.costPerUnit.toFixed(4)}
                    <div className="text-xs text-gray-500 font-normal">per {material.purchaseUnit}</div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className={material.stockQuantity <= material.lowStockThreshold ? 'text-red-600 font-semibold' : ''}>
                      {material.stockQuantity}{material.purchaseUnit}
                    </div>
                    {material.stockQuantity <= material.lowStockThreshold && (
                      <div className="text-xs text-red-600">Low stock!</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-600">{material.supplier || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setAddStockMaterial(material)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded"
                        title="Add Stock"
                      >
                        <PackagePlus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setEditingMaterial(material);
                          setShowAddModal(true);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteMaterial(material.id, material.name)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {materials.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No materials found. Add your first material to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <MaterialModal
          material={editingMaterial}
          onClose={() => {
            setShowAddModal(false);
            setEditingMaterial(null);
          }}
          onSave={() => {
            setShowAddModal(false);
            setEditingMaterial(null);
            fetchMaterials();
          }}
        />
      )}

      {/* Add Stock Modal */}
      {addStockMaterial && (
        <AddStockModal
          material={addStockMaterial}
          onClose={() => setAddStockMaterial(null)}
          onSave={() => {
            setAddStockMaterial(null);
            fetchMaterials();
          }}
        />
      )}
    </div>
  );
}

// Material Add/Edit Modal Component
function MaterialModal({
  material,
  onClose,
  onSave,
}: {
  material: Material | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const { branchFetch } = useBranch();
  const [formData, setFormData] = useState({
    name: material?.name || '',
    category: material?.category || 'ingredient',
    purchaseUnit: material?.purchaseUnit || 'g',
    purchaseQuantity: material?.purchaseQuantity || '',
    purchaseCost: material?.purchaseCost || '',
    stockQuantity: material?.stockQuantity || 0,
    lowStockThreshold: material?.lowStockThreshold || 0,
    supplier: material?.supplier || '',
  });
  const [saving, setSaving] = useState(false);

  const costPerUnit = formData.purchaseQuantity && formData.purchaseCost
    ? (parseFloat(String(formData.purchaseCost)) / parseFloat(String(formData.purchaseQuantity))).toFixed(4)
    : '0.0000';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const url = material
        ? `/api/admin/materials/${material.id}`
        : '/api/admin/materials';

      const method = material ? 'PUT' : 'POST';

      const res = await branchFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Failed to save material');
      }

      const result = await res.json();

      if (result.priceChanged) {
        alert('Material updated! All recipes using this material have been recalculated.');
      }

      onSave();
    } catch (error) {
      console.error('Failed to save material:', error);
      alert('Failed to save material. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">
            {material ? 'Edit Material' : 'Add New Material'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Material Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., Coffee Beans (Arabica)"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="ingredient">Ingredient</option>
                <option value="packaging">Packaging</option>
                <option value="consumable">Consumable</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Quantity *
              </label>
              <input
                type="number"
                step="any"
                value={formData.purchaseQuantity}
                onChange={(e) => setFormData({ ...formData, purchaseQuantity: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit *
              </label>
              <select
                value={formData.purchaseUnit}
                onChange={(e) => setFormData({ ...formData, purchaseUnit: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
                <option value="g">grams (g)</option>
                <option value="kg">kilograms (kg)</option>
                <option value="ml">milliliters (ml)</option>
                <option value="L">liters (L)</option>
                <option value="unit">units</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Cost (RM) *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.purchaseCost}
                onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="75.00"
                required
              />
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Per Unit
              </label>
              <p className="text-2xl font-bold text-blue-600">
                RM {costPerUnit}
              </p>
              <p className="text-xs text-gray-500">per {formData.purchaseUnit}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Stock
              </label>
              <input
                type="number"
                step="any"
                value={formData.stockQuantity}
                onChange={(e) => setFormData({ ...formData, stockQuantity: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="0"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Low Stock Alert
              </label>
              <input
                type="number"
                step="any"
                value={formData.lowStockThreshold}
                onChange={(e) => setFormData({ ...formData, lowStockThreshold: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="0"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier (Optional)
              </label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., ABC Supplies Sdn Bhd"
              />
            </div>
          </div>

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
              {saving ? 'Saving...' : (material ? 'Update Material' : 'Add Material')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddStockModal({
  material,
  onClose,
  onSave,
}: {
  material: Material;
  onClose: () => void;
  onSave: () => void;
}) {
  const { branchFetch } = useBranch();
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [saving, setSaving] = useState(false);

  const addQty = parseFloat(quantity) || 0;
  const addCost = parseFloat(totalCost) || 0;
  const newCostPerUnit = addQty > 0 ? addCost / addQty : 0;

  const currentStock = material.stockQuantity;
  const avgCostPerUnit = currentStock > 0 && addQty > 0
    ? (currentStock * material.costPerUnit + addQty * newCostPerUnit) / (currentStock + addQty)
    : addQty > 0 ? newCostPerUnit : material.costPerUnit;

  const costChanged = addQty > 0 && Math.abs(avgCostPerUnit - material.costPerUnit) > 0.0001;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await branchFetch(`/api/admin/materials/${material.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_stock',
          quantity: addQty,
          totalCost: addCost,
        }),
      });

      if (!res.ok) throw new Error('Failed to add stock');

      onSave();
    } catch (error) {
      console.error('Failed to add stock:', error);
      alert('Failed to add stock. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Add Stock</h2>
          <p className="text-sm text-gray-500 mt-1">{material.name}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Current stock</span>
              <span className="font-medium">{currentStock}{material.purchaseUnit}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-gray-600">Current cost</span>
              <span className="font-medium">RM {material.costPerUnit.toFixed(4)}/{material.purchaseUnit}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity to add ({material.purchaseUnit})
            </label>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={`e.g., ${material.purchaseQuantity}`}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Total cost of this purchase (RM)
            </label>
            <input
              type="number"
              step="0.01"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={`e.g., ${material.purchaseCost.toFixed(2)}`}
              required
            />
          </div>

          {addQty > 0 && addCost > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">New stock cost</span>
                <span className="font-medium text-blue-900">RM {newCostPerUnit.toFixed(4)}/{material.purchaseUnit}</span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1.5">
                <span className="text-blue-700 font-semibold">Avg cost after</span>
                <span className={`font-bold ${costChanged ? 'text-blue-900' : 'text-gray-700'}`}>
                  RM {avgCostPerUnit.toFixed(4)}/{material.purchaseUnit}
                </span>
              </div>
              {costChanged && (
                <p className="text-xs text-blue-600">
                  {avgCostPerUnit > material.costPerUnit ? '↑' : '↓'} {Math.abs(((avgCostPerUnit - material.costPerUnit) / material.costPerUnit) * 100).toFixed(1)}% from current — recipes will recalculate
                </p>
              )}
              <div className="flex justify-between border-t border-blue-200 pt-1.5">
                <span className="text-blue-700">Stock after</span>
                <span className="font-medium text-blue-900">{(currentStock + addQty)}{material.purchaseUnit}</span>
              </div>
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
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              disabled={saving || addQty <= 0}
            >
              {saving ? 'Adding...' : 'Add Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
