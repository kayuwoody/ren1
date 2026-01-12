"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Minus, Trash2, ArrowLeft } from "lucide-react";

interface Material {
  id: string;
  name: string;
  purchaseUnit: string;
  purchaseCost: number;
  supplier?: string;
  stockQuantity?: number;
  lowStockThreshold?: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  supplierCost: number;
  supplier?: string;
  stockQuantity?: number;
}

interface POItem {
  tempId: string;
  itemType: "material" | "product";
  materialId?: string;
  productId?: string;
  materialName?: string;
  productName?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  notes?: string;
}

export default function CreatePurchaseOrderPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [supplier, setSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]); // Today's date
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("Deliver by 2PM");
  const [items, setItems] = useState<POItem[]>([]);

  // Filter state
  const [filterSupplier, setFilterSupplier] = useState<string>("");

  // New item form
  const [newItemType, setNewItemType] = useState<"material" | "product">("material");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemUnitCost, setNewItemUnitCost] = useState(0);
  const [newItemNotes, setNewItemNotes] = useState("1 ctn of 1");

  const [submitting, setSubmitting] = useState(false);

  // Helper function to get stock status and color
  const getStockStatus = (stock: number | undefined, threshold: number | undefined) => {
    if (stock === undefined || stock === null) return { color: "text-gray-500", label: "N/A" };
    if (stock <= 0) return { color: "text-red-600 font-semibold", label: `${stock} (OUT)` };
    if (threshold !== undefined && stock <= threshold) return { color: "text-amber-600 font-semibold", label: `${stock} (LOW)` };
    return { color: "text-green-600", label: `${stock}` };
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [itemsRes, suppliersRes] = await Promise.all([
        fetch("/api/purchase-orders/items"),
        fetch("/api/purchase-orders/suppliers"),
      ]);

      const itemsData = await itemsRes.json();
      const suppliersData = await suppliersRes.json();

      setMaterials(itemsData.materials);
      setProducts(itemsData.products);
      setSuppliers(suppliersData.suppliers);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    if (newItemType === "material" && !selectedMaterialId) {
      alert("Please select a material");
      return;
    }
    if (newItemType === "product" && !selectedProductId) {
      alert("Please select a product");
      return;
    }
    if (newItemQuantity <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }
    if (!newItemUnit) {
      alert("Please enter a unit");
      return;
    }
    if (newItemUnitCost < 0) {
      alert("Unit cost cannot be negative");
      return;
    }

    let item: POItem;

    if (newItemType === "material") {
      const material = materials.find((m) => m.id === selectedMaterialId);
      if (!material) return;

      item = {
        tempId: `temp-${Date.now()}-${Math.random()}`,
        itemType: "material",
        materialId: material.id,
        materialName: material.name,
        quantity: newItemQuantity,
        unit: newItemUnit,
        unitCost: newItemUnitCost,
        notes: newItemNotes,
      };
    } else {
      const product = products.find((p) => p.id === selectedProductId);
      if (!product) return;

      item = {
        tempId: `temp-${Date.now()}-${Math.random()}`,
        itemType: "product",
        productId: product.id,
        productName: product.name,
        quantity: newItemQuantity,
        unit: newItemUnit,
        unitCost: newItemUnitCost,
        notes: newItemNotes,
      };
    }

    setItems([...items, item]);

    // Reset form
    setNewItemQuantity(1);
    setNewItemNotes("1 ctn of 1");
  };

  const handleRemoveItem = (tempId: string) => {
    setItems(items.filter((item) => item.tempId !== tempId));
  };

  const handleUpdateItemQuantity = (tempId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      handleRemoveItem(tempId);
      return;
    }
    setItems(items.map((item) =>
      item.tempId === tempId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const handleMaterialSelect = (materialId: string) => {
    setSelectedMaterialId(materialId);
    const material = materials.find((m) => m.id === materialId);
    if (material) {
      setNewItemUnit(material.purchaseUnit);
      setNewItemUnitCost(material.purchaseCost);
    }
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      setNewItemUnit("pcs");
      setNewItemUnitCost(product.supplierCost);
    }
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  };

  const handleSubmit = async () => {
    if (!supplier) {
      alert("Please enter a supplier name");
      return;
    }

    if (items.length === 0) {
      alert("Please add at least one item");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          orderDate: orderDate || undefined,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          notes: notes || undefined,
          items: items.map((item) => ({
            itemType: item.itemType,
            materialId: item.materialId,
            productId: item.productId,
            quantity: item.quantity,
            unit: item.unit,
            unitCost: item.unitCost,
            notes: item.notes,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Purchase order created: ${data.poNumber}`);
        router.push("/admin/purchase-orders");
      } else {
        const data = await response.json();
        alert(`Failed to create purchase order: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to create purchase order:", error);
      alert("Failed to create purchase order");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter materials and products by supplier
  const filteredMaterials = filterSupplier
    ? materials.filter((m) => m.supplier === filterSupplier)
    : materials;

  const filteredProducts = filterSupplier
    ? products.filter((p) => p.supplier === filterSupplier)
    : products;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/admin/purchase-orders")}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Create Purchase Order
            </h1>
            <p className="text-gray-600">Add items and submit to supplier</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Order Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Supplier *
              </label>
              <input
                type="text"
                list="suppliers"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Enter supplier name"
              />
              <datalist id="suppliers">
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Order Date
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              rows={3}
              placeholder="Additional notes or instructions"
            />
          </div>
        </div>

        {/* Add Item Form */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add Items</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Supplier (Optional)
              </label>
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              >
                <option value="">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="material"
                    checked={newItemType === "material"}
                    onChange={() => setNewItemType("material")}
                    className="text-amber-600"
                  />
                  <span>Material</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    value="product"
                    checked={newItemType === "product"}
                    onChange={() => setNewItemType("product")}
                    className="text-amber-600"
                  />
                  <span>Product</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {newItemType === "material" ? "Material" : "Product"} *
              </label>
              {newItemType === "material" ? (
                <select
                  value={selectedMaterialId}
                  onChange={(e) => handleMaterialSelect(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Select material...</option>
                  {filteredMaterials
                    .sort((a, b) => (a.stockQuantity ?? 999) - (b.stockQuantity ?? 999))
                    .map((m) => {
                      const stockStatus = getStockStatus(m.stockQuantity, m.lowStockThreshold);
                      return (
                        <option key={m.id} value={m.id}>
                          {m.name} • Stock: {stockStatus.label} • {m.supplier || "No supplier"}
                        </option>
                      );
                    })}
                </select>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Select product...</option>
                  {filteredProducts
                    .sort((a, b) => (a.stockQuantity ?? 999) - (b.stockQuantity ?? 999))
                    .map((p) => {
                      const stockStatus = getStockStatus(p.stockQuantity, undefined);
                      return (
                        <option key={p.id} value={p.id}>
                          {p.name} • Stock: {stockStatus.label} • {p.sku} • {p.supplier || "No supplier"}
                        </option>
                      );
                    })}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quantity *
              </label>
              <input
                type="number"
                value={newItemQuantity}
                onChange={(e) => {
                  const qty = parseFloat(e.target.value);
                  setNewItemQuantity(qty);
                  setNewItemNotes(`1 ctn of ${qty}`);
                }}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit *
              </label>
              <input
                type="text"
                value={newItemUnit}
                onChange={(e) => setNewItemUnit(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="e.g., kg, liter, pcs"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Unit Cost (RM) *
              </label>
              <input
                type="number"
                value={newItemUnitCost}
                onChange={(e) => setNewItemUnitCost(parseFloat(e.target.value))}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Notes
              </label>
              <input
                type="text"
                value={newItemNotes}
                onChange={(e) => setNewItemNotes(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="Optional notes"
              />
            </div>
          </div>

          <button
            onClick={handleAddItem}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>

        {/* Items List */}
        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Order Items</h2>

            <div className="space-y-2 mb-4">
              {items.map((item) => (
                <div
                  key={item.tempId}
                  className="flex items-center justify-between bg-gray-50 p-4 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {item.itemType === "material"
                        ? item.materialName
                        : item.productName}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateItemQuantity(item.tempId, item.quantity - 1)}
                          className="w-7 h-7 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full transition"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="text-sm font-medium w-12 text-center">{item.quantity}</span>
                        <button
                          onClick={() => handleUpdateItemQuantity(item.tempId, item.quantity + 1)}
                          className="w-7 h-7 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full transition"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="text-sm text-gray-600">
                        {item.unit} @ RM {item.unitCost.toFixed(2)} = RM{" "}
                        {(item.quantity * item.unitCost).toFixed(2)}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-xs text-gray-500 mt-1">{item.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item.tempId)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <div className="flex justify-between items-center text-xl font-bold">
                <span>Total:</span>
                <span>RM {calculateTotal().toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push("/admin/purchase-orders")}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0}
            className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Creating..." : "Create Purchase Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
