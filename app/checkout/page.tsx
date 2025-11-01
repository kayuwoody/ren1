"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { Percent, DollarSign, Edit2, X, Tag } from "lucide-react";

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, removeFromCart, updateItemDiscount } = useCart();
  const [error, setError] = useState("");
  const [discountModal, setDiscountModal] = useState<{
    isOpen: boolean;
    productId: number | null;
    productName: string;
    retailPrice: number;
  }>({
    isOpen: false,
    productId: null,
    productName: "",
    retailPrice: 0,
  });
  const [discountType, setDiscountType] = useState<"percent" | "amount" | "override">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // Calculate totals
  const retailTotal = cartItems.reduce(
    (sum, item) => sum + item.retailPrice * item.quantity,
    0
  );
  const finalTotal = cartItems.reduce(
    (sum, item) => sum + item.finalPrice * item.quantity,
    0
  );
  const totalDiscount = retailTotal - finalTotal;

  function handleConfirm() {
    if (!cartItems.length) {
      setError("Your cart is empty.");
      return;
    }

    console.log("🛒 Proceeding to payment with cart items:", cartItems);

    // Navigate to payment page (cart stays intact)
    router.push("/payment");
  }

  function openDiscountModal(item: any) {
    setDiscountModal({
      isOpen: true,
      productId: item.productId,
      productName: item.name,
      retailPrice: item.retailPrice,
    });
    setDiscountType("percent");
    setDiscountValue("");
    setDiscountReason(item.discountReason || "");
  }

  function closeDiscountModal() {
    setDiscountModal({
      isOpen: false,
      productId: null,
      productName: "",
      retailPrice: 0,
    });
    setDiscountValue("");
    setDiscountReason("");
  }

  function applyQuickDiscount(productId: number, percent: number) {
    updateItemDiscount(productId, "percent", percent, `${percent}% off`);
  }

  function applyCustomDiscount() {
    if (!discountModal.productId) return;

    const value = parseFloat(discountValue);
    if (isNaN(value) || value < 0) {
      alert("Please enter a valid discount value");
      return;
    }

    if (discountType === "percent" && value > 100) {
      alert("Percentage discount cannot exceed 100%");
      return;
    }

    if (discountType === "amount" && value > discountModal.retailPrice) {
      alert("Discount amount cannot exceed retail price");
      return;
    }

    if (discountType === "override" && value > discountModal.retailPrice) {
      alert("Override price cannot exceed retail price");
      return;
    }

    updateItemDiscount(
      discountModal.productId,
      discountType,
      value,
      discountReason || undefined
    );
    closeDiscountModal();
  }

  function removeDiscount(productId: number) {
    updateItemDiscount(productId, "percent", 0, undefined);
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6 pb-24">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {cartItems.length === 0 ? (
        <p className="text-gray-600">Your cart is empty.</p>
      ) : (
        <>
          {/* Cart items with discount controls */}
          <div className="space-y-3">
            {cartItems.map((item) => {
              const hasDiscount = item.finalPrice < item.retailPrice;
              const itemDiscount = (item.retailPrice - item.finalPrice) * item.quantity;

              return (
                <div key={item.productId} className="bg-white border rounded-lg p-4">
                  {/* Item header */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <p className="font-semibold text-lg">{item.name}</p>
                      <p className="text-sm text-gray-500">Quantity: {item.quantity}</p>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.productId)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium ml-2"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-1 mb-3">
                    {hasDiscount && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Retail Price:</span>
                        <span className="text-gray-500 line-through">
                          RM {(item.retailPrice * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className={hasDiscount ? "text-green-700 font-medium" : "font-medium"}>
                        {hasDiscount ? "Sale Price:" : "Price:"}
                      </span>
                      <span className={hasDiscount ? "text-green-700 font-bold text-lg" : "font-bold text-lg"}>
                        RM {(item.finalPrice * item.quantity).toFixed(2)}
                      </span>
                    </div>
                    {hasDiscount && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">You save:</span>
                        <span className="text-green-600 font-semibold">
                          -RM {itemDiscount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {item.discountReason && (
                      <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
                        <Tag className="w-3 h-3" />
                        <span>{item.discountReason}</span>
                      </div>
                    )}
                  </div>

                  {/* Discount controls */}
                  <div className="flex flex-wrap gap-2">
                    {/* Quick discount buttons */}
                    <button
                      onClick={() => applyQuickDiscount(item.productId, 10)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                    >
                      10% off
                    </button>
                    <button
                      onClick={() => applyQuickDiscount(item.productId, 20)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                    >
                      20% off
                    </button>
                    <button
                      onClick={() => applyQuickDiscount(item.productId, 50)}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200"
                    >
                      50% off
                    </button>
                    <button
                      onClick={() => openDiscountModal(item)}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      Custom
                    </button>
                    {hasDiscount && (
                      <button
                        onClick={() => removeDiscount(item.productId)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
                      >
                        Remove discount
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            {totalDiscount > 0 && (
              <>
                <div className="flex justify-between text-gray-600">
                  <span>Retail Total:</span>
                  <span className="line-through">RM {retailTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-green-600 font-semibold">
                  <span>Total Discount:</span>
                  <span>-RM {totalDiscount.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between text-xl font-bold border-t pt-2">
              <span>Total:</span>
              <span className="text-green-700">RM {finalTotal.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleConfirm}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold text-lg"
          >
            Proceed to Payment
          </button>

          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

          <p className="text-xs text-gray-500 text-center">
            Review your order and proceed to payment
          </p>
        </>
      )}

      {/* Custom Discount Modal */}
      {discountModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Custom Discount</h2>
                <p className="text-sm text-gray-600">{discountModal.productName}</p>
                <p className="text-xs text-gray-500">Retail: RM {discountModal.retailPrice.toFixed(2)}</p>
              </div>
              <button
                onClick={closeDiscountModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Discount type selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discount Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setDiscountType("percent")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      discountType === "percent"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <Percent className="w-4 h-4 mx-auto mb-1" />
                    Percent
                  </button>
                  <button
                    onClick={() => setDiscountType("amount")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      discountType === "amount"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <DollarSign className="w-4 h-4 mx-auto mb-1" />
                    Amount
                  </button>
                  <button
                    onClick={() => setDiscountType("override")}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                      discountType === "override"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    <Edit2 className="w-4 h-4 mx-auto mb-1" />
                    Override
                  </button>
                </div>
              </div>

              {/* Discount value */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {discountType === "percent" && "Discount Percentage (%)"}
                  {discountType === "amount" && "Discount Amount (RM)"}
                  {discountType === "override" && "New Price (RM)"}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={discountType === "percent" ? "100" : discountModal.retailPrice}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={
                    discountType === "percent" ? "e.g., 15" :
                    discountType === "amount" ? "e.g., 5.00" :
                    "e.g., 12.00"
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Discount reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason (optional)
                </label>
                <input
                  type="text"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder="e.g., Member discount, Happy hour, Promo"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Preview */}
              {discountValue && !isNaN(parseFloat(discountValue)) && (
                <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-gray-600 font-medium">Preview:</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700">Retail Price:</span>
                    <span className="line-through">RM {discountModal.retailPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-green-700">Sale Price:</span>
                    <span className="text-green-700">
                      RM {(() => {
                        const value = parseFloat(discountValue);
                        if (discountType === "percent") {
                          return (discountModal.retailPrice * (1 - value / 100)).toFixed(2);
                        } else if (discountType === "amount") {
                          return (discountModal.retailPrice - value).toFixed(2);
                        } else {
                          return value.toFixed(2);
                        }
                      })()}
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={applyCustomDiscount}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-semibold"
                >
                  Apply Discount
                </button>
                <button
                  onClick={closeDiscountModal}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
