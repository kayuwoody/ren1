'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, ChefHat, Calculator, Search, RefreshCw } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  sku: string;
  currentPrice: number;
  unitCost: number;
}

interface Material {
  id: string;
  name: string;
  category: string;
  purchaseUnit: string;
  costPerUnit: number;
}

interface RecipeItem {
  itemType?: 'material' | 'product';
  materialId?: string;
  linkedProductId?: string;
  materialName?: string;
  materialCategory?: string;
  linkedProductName?: string;
  linkedProductSku?: string;
  purchaseUnit?: string;
  costPerUnit?: number;
  quantity: number;
  unit: string;
  calculatedCost?: number;
  isOptional?: boolean;
}

interface Recipe {
  productId: string;
  productName: string;
  items: RecipeItem[];
  totalCost: number;
  totalOptionalCost: number;
}

export default function RecipesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showAddIngredient, setShowAddIngredient] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchMaterials();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchRecipe(selectedProduct.id);
    }
  }, [selectedProduct]);

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
      const res = await fetch('/api/admin/products');
      const data = await res.json();
      setProducts(data.products || []);
      setFilteredProducts(data.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setSyncing(false);
    }
  }

  async function fetchMaterials() {
    try {
      const res = await fetch('/api/admin/materials');
      const data = await res.json();
      setMaterials(data.materials || []);
    } catch (error) {
      console.error('Failed to fetch materials:', error);
    }
  }

  async function fetchRecipe(productId: string) {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/recipes/${productId}`);
      const data = await res.json();
      // Ensure items is always an array
      const recipe = data.recipe;
      if (recipe && !Array.isArray(recipe.items)) {
        recipe.items = [];
      }
      setRecipe(recipe);
    } catch (error) {
      console.error('Failed to fetch recipe:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveRecipe() {
    if (!selectedProduct || !recipe || !recipe.items) return;

    setSaving(true);
    try {
      const items = recipe.items.map(item => ({
        itemType: item.itemType || 'material',
        materialId: item.materialId,
        linkedProductId: item.linkedProductId,
        quantity: item.quantity,
        unit: item.unit,
        isOptional: item.isOptional || false,
      }));

      const res = await fetch(`/api/admin/recipes/${selectedProduct.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        throw new Error('Failed to save recipe');
      }

      alert('Recipe saved successfully!');
      await fetchRecipe(selectedProduct.id);
      await fetchProducts(); // Refresh to get updated COGS
    } catch (error) {
      console.error('Failed to save recipe:', error);
      alert('Failed to save recipe. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function addItem(itemType: 'material' | 'product', itemId: string, quantity: number, isOptional: boolean) {
    if (!selectedProduct) return;

    let newItem: RecipeItem;

    if (itemType === 'material') {
      const material = materials.find(m => m.id === itemId);
      if (!material) return;

      newItem = {
        itemType: 'material',
        materialId: itemId,
        materialName: material.name,
        materialCategory: material.category,
        purchaseUnit: material.purchaseUnit,
        costPerUnit: material.costPerUnit,
        quantity,
        unit: material.purchaseUnit,
        calculatedCost: quantity * material.costPerUnit,
        isOptional,
      };
    } else {
      const product = products.find(p => p.id === itemId);
      if (!product) return;

      newItem = {
        itemType: 'product',
        linkedProductId: itemId,
        linkedProductName: product.name,
        linkedProductSku: product.sku,
        costPerUnit: product.unitCost,
        quantity,
        unit: 'unit',
        calculatedCost: quantity * product.unitCost,
        isOptional,
      };
    }

    // Initialize recipe if it doesn't exist
    if (!recipe) {
      setRecipe({
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        items: [newItem],
        totalCost: isOptional ? 0 : newItem.calculatedCost!,
        totalOptionalCost: isOptional ? newItem.calculatedCost! : 0,
      });
    } else {
      // Ensure items is an array before spreading
      const currentItems = Array.isArray(recipe.items) ? recipe.items : [];
      setRecipe({
        ...recipe,
        items: [...currentItems, newItem],
        totalCost: isOptional ? recipe.totalCost : recipe.totalCost + newItem.calculatedCost!,
        totalOptionalCost: isOptional ? recipe.totalOptionalCost + newItem.calculatedCost! : recipe.totalOptionalCost,
      });
    }

    setShowAddIngredient(false);
  }

  function removeIngredient(index: number) {
    if (!recipe || !recipe.items) return;

    const item = recipe.items[index];
    const newItems = recipe.items.filter((_, i) => i !== index);

    setRecipe({
      ...recipe,
      items: newItems,
      totalCost: item.isOptional ? recipe.totalCost : recipe.totalCost - (item.calculatedCost || 0),
      totalOptionalCost: item.isOptional ? recipe.totalOptionalCost - (item.calculatedCost || 0) : recipe.totalOptionalCost,
    });
  }

  function updateQuantity(index: number, newQuantity: number) {
    if (!recipe || !recipe.items) return;

    const oldItem = recipe.items[index];
    let costPerUnit = 0;

    if (oldItem.itemType === 'product') {
      const product = products.find(p => p.id === oldItem.linkedProductId);
      if (!product) return;
      costPerUnit = product.unitCost;
    } else {
      const material = materials.find(m => m.id === oldItem.materialId);
      if (!material) return;
      costPerUnit = material.costPerUnit;
    }

    const newCost = newQuantity * costPerUnit;
    const oldCost = oldItem.calculatedCost || 0;

    const newItems = [...recipe.items];
    newItems[index] = {
      ...oldItem,
      quantity: newQuantity,
      calculatedCost: newCost,
    };

    setRecipe({
      ...recipe,
      items: newItems,
      totalCost: oldItem.isOptional ? recipe.totalCost : recipe.totalCost - oldCost + newCost,
      totalOptionalCost: oldItem.isOptional ? recipe.totalOptionalCost - oldCost + newCost : recipe.totalOptionalCost,
    });
  }

  const grossProfit = selectedProduct ? selectedProduct.currentPrice - (recipe?.totalCost || 0) : 0;
  const grossMargin = selectedProduct && selectedProduct.currentPrice > 0
    ? (grossProfit / selectedProduct.currentPrice) * 100
    : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin/costs" className="p-2 hover:bg-gray-100 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <ChefHat className="w-7 h-7 text-orange-600" />
                Recipe Management
              </h1>
              <p className="text-sm text-gray-500">Build product recipes and calculate COGS</p>
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
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={fetchProducts}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from WooCommerce'}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredProducts.length === 0 ? (
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
                      selectedProduct?.id === product.id ? 'bg-orange-50 border-l-4 border-orange-500' : ''
                    }`}
                  >
                    <div className="font-medium">{product.name}</div>
                    <div className="text-sm text-gray-600">{product.sku}</div>
                    <div className="text-sm mt-1">
                      <span className="text-gray-600">COGS: </span>
                      <span className="font-semibold">RM {product.unitCost.toFixed(2)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content - Recipe Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedProduct ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <ChefHat className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Select a product to build or edit its recipe</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Product Info */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">{selectedProduct.name}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Selling Price</p>
                    <p className="text-lg font-semibold">RM {selectedProduct.currentPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Current COGS</p>
                    <p className="text-lg font-semibold text-orange-600">
                      RM {(recipe?.totalCost || 0).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Gross Profit</p>
                    <p className="text-lg font-semibold text-green-600">
                      RM {grossProfit.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Margin</p>
                    <p className={`text-lg font-semibold ${
                      grossMargin >= 60 ? 'text-green-600' :
                      grossMargin >= 40 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {grossMargin.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>

              {/* Recipe Items */}
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Calculator className="w-5 h-5 text-blue-600" />
                    Recipe Items
                  </h3>
                  <button
                    onClick={() => setShowAddIngredient(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                </div>

                <div className="p-6">
                  {loading ? (
                    <p className="text-center text-gray-500 py-8">Loading recipe...</p>
                  ) : recipe && recipe.items && recipe.items.length > 0 ? (
                    <div className="space-y-3">
                      {recipe.items.map((item, index) => (
                        <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <div className="font-medium">
                              {item.itemType === 'product' ? item.linkedProductName : item.materialName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {item.itemType === 'product' ? (
                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">
                                  Product: {item.linkedProductSku}
                                </span>
                              ) : (
                                <span className="capitalize">{item.materialCategory}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="any"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(index, parseFloat(e.target.value) || 0)}
                              className="w-20 px-2 py-1 border rounded text-right"
                            />
                            <span className="text-sm text-gray-600">{item.unit}</span>
                          </div>
                          <div className="text-right min-w-[80px]">
                            <div className="font-semibold">RM {(item.calculatedCost || 0).toFixed(4)}</div>
                            <div className="text-xs text-gray-500">
                              @ RM {(item.costPerUnit || 0).toFixed(4)}/{item.unit}
                            </div>
                          </div>
                          {item.isOptional && (
                            <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                              Optional
                            </span>
                          )}
                          <button
                            onClick={() => removeIngredient(index)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold">Required Items Total:</span>
                          <span className="text-lg font-bold text-orange-600">
                            RM {recipe.totalCost.toFixed(2)}
                          </span>
                        </div>
                        {recipe.totalOptionalCost > 0 && (
                          <div className="flex justify-between items-center text-sm text-gray-600">
                            <span>Optional Items:</span>
                            <span>RM {recipe.totalOptionalCost.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                      <p>No ingredients yet. Add your first ingredient to start building the recipe.</p>
                    </div>
                  )}
                </div>

                <div className="p-6 border-t bg-gray-50">
                  <button
                    onClick={saveRecipe}
                    disabled={saving || !recipe || !recipe.items || recipe.items.length === 0}
                    className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Recipe & Update COGS'}
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Add Ingredient Modal */}
        {showAddIngredient && (
          <AddItemModal
            materials={materials}
            products={products.filter(p => p.id !== selectedProduct?.id)}
            onClose={() => setShowAddIngredient(false)}
            onAdd={addItem}
          />
        )}
    </div>
  );
}

// Add Item Modal (Materials or Products)
function AddItemModal({
  materials,
  products,
  onClose,
  onAdd,
}: {
  materials: Material[];
  products: Product[];
  onClose: () => void;
  onAdd: (itemType: 'material' | 'product', itemId: string, quantity: number, isOptional: boolean) => void;
}) {
  const [itemType, setItemType] = useState<'material' | 'product'>('material');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState<string>('1');
  const [isOptional, setIsOptional] = useState(false);
  const [filter, setFilter] = useState('');

  const material = materials.find(m => m.id === selectedMaterial);
  const product = products.find(p => p.id === selectedProduct);

  const cost = itemType === 'material'
    ? (material && quantity ? parseFloat(quantity) * material.costPerUnit : 0)
    : (product && quantity ? parseFloat(quantity) * product.unitCost : 0);

  const filteredMaterials = materials.filter(m =>
    m.name.toLowerCase().includes(filter.toLowerCase()) ||
    m.category.toLowerCase().includes(filter.toLowerCase())
  );

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.sku.toLowerCase().includes(filter.toLowerCase())
  );

  function handleTabChange(newType: 'material' | 'product') {
    setItemType(newType);
    setFilter('');
    setSelectedMaterial('');
    setSelectedProduct('');
  }

  function handleAdd() {
    const itemId = itemType === 'material' ? selectedMaterial : selectedProduct;

    if (!itemId || !quantity) {
      alert(`Please select a ${itemType} and enter quantity`);
      return;
    }

    onAdd(itemType, itemId, parseFloat(quantity), isOptional);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-2xl font-bold">Add to Recipe</h2>
        </div>

        {/* Item Type Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => handleTabChange('material')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              itemType === 'material'
                ? 'bg-orange-50 text-orange-700 border-b-2 border-orange-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>Material / Ingredient</span>
            <span className="ml-2 text-xs opacity-60">({materials.length})</span>
          </button>
          <button
            onClick={() => handleTabChange('product')}
            className={`flex-1 px-6 py-3 font-medium transition ${
              itemType === 'product'
                ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>Linked Product</span>
            <span className="ml-2 text-xs opacity-60">({products.length})</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search {itemType === 'material' ? 'Materials' : 'Products'}
            </label>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={itemType === 'material' ? 'Search by name or category...' : 'Search by name or SKU...'}
            />
          </div>

          {/* Material Selection */}
          {itemType === 'material' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Material *
              </label>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
                size={8}
              >
                <option value="">-- Select a material --</option>
                {filteredMaterials.map((mat) => (
                  <option key={mat.id} value={mat.id}>
                    {mat.name} ({mat.category}) - RM {mat.costPerUnit.toFixed(4)}/{mat.purchaseUnit}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Product Selection */}
          {itemType === 'product' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Product *
              </label>
              {filteredProducts.length === 0 ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    {products.length === 0
                      ? 'No products available. Please sync products from WooCommerce first.'
                      : 'No products match your search.'}
                  </p>
                </div>
              ) : (
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  size={8}
                >
                  <option value="">-- Select a product --</option>
                  {filteredProducts.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku}) - RM {prod.unitCost.toFixed(2)}/unit
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity * {itemType === 'material' && material ? `(${material.purchaseUnit})` : ''}
            </label>
            <input
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder={
                itemType === 'material' && material
                  ? `e.g., 12 ${material.purchaseUnit}`
                  : 'Enter quantity'
              }
              required
            />
          </div>

          {/* Optional Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="optional"
              checked={isOptional}
              onChange={(e) => setIsOptional(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="optional" className="text-sm text-gray-700">
              Optional {itemType === 'material' ? 'ingredient' : 'add-on'} (e.g., syrup, extra toppings)
            </label>
          </div>

          {/* Cost Preview */}
          {((itemType === 'material' && material && quantity) || (itemType === 'product' && product && quantity)) && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-700 mb-1">Cost Calculation:</p>
              {itemType === 'material' && material ? (
                <p className="text-lg font-semibold text-blue-900">
                  {quantity} {material.purchaseUnit} × RM {material.costPerUnit.toFixed(4)} = RM {cost.toFixed(4)}
                </p>
              ) : itemType === 'product' && product ? (
                <p className="text-lg font-semibold text-blue-900">
                  {quantity} unit × RM {product.unitCost.toFixed(2)} = RM {cost.toFixed(2)}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add to Recipe
          </button>
        </div>
      </div>
    </div>
  );
}
