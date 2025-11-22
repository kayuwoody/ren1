"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Plus, Trash2, ArrowLeft } from "lucide-react";

interface Material {
  id: string;
  name: string;
  purchaseUnit: string;
  purchaseCost: number;
  supplier?: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  supplierCost: number;
}

interface POItem {
  tempId: string;
  id?: string; // For existing items
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

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  totalAmount: number;
  notes?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  items: Array<{
    id: string;
    itemType: "material" | "product";
    materialName?: string;
    productName?: string;
    materialId?: string;
    productId?: string;
    quantity: number;
    unit: string;
    unitCost: number;
    totalCost: number;
    notes?: string;
  }>;
}

export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams();
  const poId = params?.id as string;

  const [materials, setMaterials] = useState<Material[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPO, setLoadingPO] = useState(true);

  // Form state
  const [poNumber, setPoNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([]);

  // New item form
  const [newItemType, setNewItemType] = useState<"material" | "product">("material");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState("");
  const [newItemUnitCost, setNewItemUnitCost] = useState(0);
  const [newItemNotes, setNewItemNotes] = useState("1 ctn of 1");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
    loadPurchaseOrder();
  }, [poId]);

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

  const loadPurchaseOrder = async () => {
    try {
      const response = await fetch(`/api/purchase-orders/${poId}`);
      if (!response.ok) {
        throw new Error("Failed to load purchase order");
      }
      const po: PurchaseOrder = await response.json();

      // Only allow editing if status is draft
      if (po.status !== "draft") {
        alert("Only draft purchase orders can be edited");
        router.push("/admin/purchase-orders");
        return;
      }

      setPoNumber(po.poNumber);
      setSupplier(po.supplier);
      setOrderDate(po.orderDate || "");
      setExpectedDeliveryDate(po.expectedDeliveryDate || "");
      setNotes(po.notes || "");

      // Convert existing items to POItem format
      const existingItems: POItem[] = po.items.map((item) => ({
        tempId: `existing-${item.id}`,
        id: item.id,
        itemType: item.itemType,
        materialId: item.materialId,
        productId: item.productId,
        materialName: item.materialName,
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        unitCost: item.unitCost,
        notes: item.notes,
      }));

      setItems(existingItems);
    } catch (error) {
      console.error("Failed to load purchase order:", error);
      alert("Failed to load purchase order");
      router.push("/admin/purchase-orders");
    } finally {
      setLoadingPO(false);
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
      // Update PO metadata
      const updateResponse = await fetch(`/api/purchase-orders/${poId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          orderDate: orderDate || undefined,
          expectedDeliveryDate: expectedDeliveryDate || undefined,
          notes: notes || undefined,
        }),
      });

      if (!updateResponse.ok) {
        throw new Error("Failed to update purchase order metadata");
      }

      // Update items
      const itemsResponse = await fetch(`/api/purchase-orders/${poId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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

      if (!itemsResponse.ok) {
        const errorData = await itemsResponse.json();
        throw new Error(`Failed to update items: ${errorData.error || "Unknown error"}`);
      }

      alert("Purchase order updated successfully!");
      router.push("/admin/purchase-orders");
    } catch (error: any) {
      console.error("Failed to update purchase order:", error);
      alert(error.message || "Failed to update purchase order");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || loadingPO) {
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
              Edit Purchase Order - {poNumber}
            </h1>
            <p className="text-gray-600">Update order details</p>
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
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.supplier || "No supplier"})
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                >
                  <option value="">Select product...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
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
                    <p className="text-sm text-gray-600">
                      {item.quantity} {item.unit} @ RM {item.unitCost.toFixed(2)} = RM{" "}
                      {(item.quantity * item.unitCost).toFixed(2)}
                    </p>
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
            {submitting ? "Updating..." : "Update Purchase Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
