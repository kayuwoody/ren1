"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Plus, Package, TruckIcon, FileText } from "lucide-react";
import { useBranch } from "@/context/branchContext";

interface PurchaseOrderItem {
  id: string;
  itemType: "material" | "product";
  materialName?: string;
  productName?: string;
  sku?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  receivedQuantity?: number;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplier: string;
  status: "draft" | "ordered" | "partial" | "received" | "cancelled";
  totalAmount: number;
  notes?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  receivedDate?: string;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItem[];
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { branchFetch, currentBranch } = useBranch();
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, string>>({});
  const [submittingReceive, setSubmittingReceive] = useState(false);

  useEffect(() => {
    loadPurchaseOrders();
  }, [currentBranch]);

  const loadPurchaseOrders = async () => {
    try {
      const response = await branchFetch("/api/purchase-orders");
      const data = await response.json();
      setPurchaseOrders(data);
    } catch (error) {
      console.error("Failed to load purchase orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = async (id: string, poNumber: string) => {
    try {
      const response = await fetch(`/api/purchase-orders/${id}/csv`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO-${poNumber}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download CSV:", error);
      alert("Failed to download CSV");
    }
  };

  const handleDownloadPDF = async (id: string, poNumber: string) => {
    try {
      const response = await fetch(`/api/purchase-orders/${id}/pdf`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PO-${poNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download PDF:", error);
      alert("Failed to download PDF");
    }
  };

  // Open the receive dialog, defaulting each line's "receiving now" to its
  // outstanding quantity (ordered − already received).
  const openReceiveModal = (po: PurchaseOrder) => {
    const inputs: Record<string, string> = {};
    for (const item of po.items) {
      const outstanding = item.quantity - (item.receivedQuantity || 0);
      inputs[item.id] = String(Math.max(0, outstanding));
    }
    setReceiveInputs(inputs);
    setReceivingPO(po);
  };

  const submitReceive = async () => {
    if (!receivingPO) return;
    setSubmittingReceive(true);
    try {
      // Send cumulative received qty per line = already received + receiving now.
      const items = receivingPO.items.map((item) => {
        const already = item.receivedQuantity || 0;
        const now = Math.max(0, Number(receiveInputs[item.id]) || 0);
        const capped = Math.min(now, item.quantity - already); // never exceed ordered
        return { itemId: item.id, receivedQuantity: already + capped };
      });

      const response = await fetch(`/api/purchase-orders/${receivingPO.id}/receive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || "Inventory updated.");
        setReceivingPO(null);
        loadPurchaseOrders();
      } else {
        const data = await response.json();
        alert(`Failed to receive: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to receive:", error);
      alert("Failed to receive");
    } finally {
      setSubmittingReceive(false);
    }
  };

  const handleMarkOrdered = async (id: string) => {
    if (!confirm("Mark this purchase order as ordered?")) {
      return;
    }

    try {
      const response = await fetch(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ordered" }),
      });

      if (response.ok) {
        alert("Purchase order marked as ordered!");
        loadPurchaseOrders();
      } else {
        const data = await response.json();
        alert(`Failed to update status: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to update status:", error);
      alert("Failed to update purchase order status");
    }
  };

  const handleDelete = async (id: string, poNumber: string) => {
    if (!confirm(`Delete purchase order ${poNumber}? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/purchase-orders/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("Purchase order deleted");
        loadPurchaseOrders();
      } else {
        const data = await response.json();
        alert(`Failed to delete: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Failed to delete:", error);
      alert("Failed to delete purchase order");
    }
  };

  const filteredOrders = purchaseOrders.filter((po) => {
    if (filter === "all") return true;
    return po.status === filter;
  });

  const statusColors = {
    draft: "bg-gray-200 text-gray-800",
    ordered: "bg-blue-200 text-blue-800",
    partial: "bg-amber-200 text-amber-800",
    received: "bg-green-200 text-green-800",
    cancelled: "bg-red-200 text-red-800",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Loading purchase orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Purchase Orders
            </h1>
            <p className="text-gray-600">
              Manage supplier orders and inventory replenishment
            </p>
          </div>
          <button
            onClick={() => router.push("/admin/purchase-orders/create")}
            className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Purchase Order
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {[
            { value: "all", label: "All Orders" },
            { value: "draft", label: "Draft" },
            { value: "ordered", label: "Ordered" },
            { value: "partial", label: "Partial" },
            { value: "received", label: "Received" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === f.value
                  ? "bg-amber-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Purchase Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">
              No purchase orders found{filter !== "all" ? ` with status "${filter}"` : ""}
            </p>
            <button
              onClick={() => router.push("/admin/purchase-orders/create")}
              className="text-amber-600 hover:text-amber-700 font-medium"
            >
              Create your first purchase order →
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((po) => (
              <div
                key={po.id}
                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {po.poNumber}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          statusColors[po.status]
                        }`}
                      >
                        {po.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-gray-600 space-y-1">
                      <p className="flex items-center gap-2">
                        <TruckIcon className="w-4 h-4" />
                        <span className="font-medium">{po.supplier}</span>
                      </p>
                      <p className="text-sm">
                        {po.items.length} item{po.items.length !== 1 ? "s" : ""}{" "}
                        • Total: RM {po.totalAmount.toFixed(2)}
                      </p>
                      {po.orderDate && (
                        <p className="text-sm">
                          Order Date:{" "}
                          {new Date(po.orderDate).toLocaleDateString("en-MY")}
                        </p>
                      )}
                      {po.expectedDeliveryDate && (
                        <p className="text-sm">
                          Expected Delivery:{" "}
                          {new Date(po.expectedDeliveryDate).toLocaleDateString(
                            "en-MY"
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownloadPDF(po.id, po.poNumber)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
                    >
                      <FileText className="w-4 h-4" />
                      Download PDF
                    </button>

                    <button
                      onClick={() => handleDownloadCSV(po.id, po.poNumber)}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                    >
                      <FileDown className="w-4 h-4" />
                      Export CSV
                    </button>

                    {(po.status === "ordered" || po.status === "partial") && (
                      <button
                        onClick={() => openReceiveModal(po)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                      >
                        {po.status === "partial" ? "Receive More" : "Receive Items"}
                      </button>
                    )}

                    {po.status === "draft" && (
                      <>
                        <button
                          onClick={() => handleMarkOrdered(po.id)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                          Mark as Ordered
                        </button>
                        <button
                          onClick={() =>
                            router.push(`/admin/purchase-orders/edit/${po.id}`)
                          }
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(po.id, po.poNumber)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Items Preview */}
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Items:
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {po.items.map((item) => (
                      <div
                        key={item.id}
                        className="text-sm text-gray-600 bg-gray-50 p-2 rounded"
                      >
                        <span className="font-medium">
                          {item.itemType === "material"
                            ? item.materialName
                            : item.productName}
                        </span>{" "}
                        • {item.quantity} {item.unit} @ RM{" "}
                        {item.unitCost.toFixed(2)} = RM{" "}
                        {item.totalCost.toFixed(2)}
                        {(po.status === "partial" || po.status === "received") &&
                          (item.receivedQuantity ?? 0) < item.quantity && (
                            <span className="ml-1 text-amber-700 font-medium">
                              (received {item.receivedQuantity ?? 0}/{item.quantity})
                            </span>
                          )}
                      </div>
                    ))}
                  </div>
                </div>

                {po.notes && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Notes:</span> {po.notes}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Receive dialog — edit the quantity actually received per line */}
      {receivingPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                Receive Delivery — {receivingPO.poNumber}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Enter how much of each line actually arrived. Leave the full
                amount to receive in full, or lower it for a short delivery —
                you can receive the rest later.
              </p>
            </div>

            <div className="p-6 overflow-y-auto space-y-3">
              {receivingPO.items.map((item) => {
                const already = item.receivedQuantity || 0;
                const outstanding = item.quantity - already;
                const name = item.itemType === "material" ? item.materialName : item.productName;
                return (
                  <div key={item.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">{name}</div>
                      <div className="text-xs text-gray-500">
                        Ordered {item.quantity} {item.unit}
                        {already > 0 && ` · already received ${already} · outstanding ${outstanding}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={outstanding}
                        step="any"
                        value={receiveInputs[item.id] ?? ""}
                        onChange={(e) =>
                          setReceiveInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-right"
                      />
                      <span className="text-sm text-gray-500 w-10">{item.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button
                onClick={() => setReceivingPO(null)}
                disabled={submittingReceive}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitReceive}
                disabled={submittingReceive}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
              >
                {submittingReceive ? "Receiving…" : "Confirm & Update Stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
