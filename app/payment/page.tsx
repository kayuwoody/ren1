"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/context/cartContext";
import { useBranch } from "@/context/branchContext";
import CashPayment from "@/components/CashPayment";
import { useScanDetector } from "@/lib/hooks/useScanDetector";
import { Gift, X } from "lucide-react";

interface AppliedVoucher {
  id: string;
  code: string;
  type: "fixed" | "percent";
  discount_value: number;
  discount_amount: number;
}

export default function PaymentPage() {
  const router = useRouter();
  const { cartItems, clearCart } = useCart();
  const { branchFetch } = useBranch();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_qr" | null>(null);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);

  const retailTotal = cartItems.reduce((sum, item) => sum + item.retailPrice * item.quantity, 0);
  const itemFinalTotal = cartItems.reduce((sum, item) => sum + item.finalPrice * item.quantity, 0);
  const itemDiscount = retailTotal - itemFinalTotal;
  const voucherAmount = voucher?.discount_amount ?? 0;
  const finalTotal = Math.max(0, itemFinalTotal - voucherAmount);
  const hasDiscount = itemDiscount > 0 || voucherAmount > 0;

  const handleVoucherScan = useCallback(async (scannedValue: string) => {
    if (order) return;
    const code = scannedValue.trim().toUpperCase();
    if (!/^[A-Z0-9\-]{4,}$/.test(code)) return;
    if (/^(\+?60|0)\d{8,11}$/.test(code.replace(/[^0-9+]/g, ''))) return;

    setVoucherError(null);
    try {
      const res = await fetch("/api/vouchers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, order_total: itemFinalTotal }),
      });
      const data = await res.json();
      if (!data.valid) {
        setVoucherError(data.reason || "Invalid voucher");
        return;
      }
      setVoucher(data.voucher);
    } catch {
      setVoucherError("Failed to validate voucher");
    }
  }, [order, itemFinalTotal]);

  useScanDetector(handleVoucherScan);

  useEffect(() => {
    if (cartItems.length > 0) {
      fetch('/api/cart/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setPendingOrder: true,
          orderId: order?.id || 'pending',
          items: cartItems,
        }),
      }).catch(err => console.error('Failed to set pending order:', err));
    }
  }, [cartItems, order]);

  const handlePaymentMethodSelect = async (method: "cash" | "bank_qr") => {
    setPaymentMethod(method);
    setLoading(true);
    setError(null);

    try {
      const totalDiscount = cartItems.reduce((sum, item) => {
        if (item.discountReason) {
          return sum + ((item.retailPrice - item.finalPrice) * item.quantity);
        }
        return sum;
      }, 0);

      const orderMetaData: Array<{ key: string; value: string }> = [];
      if (totalDiscount > 0) {
        orderMetaData.push({ key: "_total_discount", value: totalDiscount.toFixed(2) });
      }
      if (voucher) {
        orderMetaData.push(
          { key: "_voucher_code", value: voucher.code },
          { key: "_voucher_discount", value: voucherAmount.toFixed(2) },
        );
      }

      const response = await branchFetch("/api/orders/create-with-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: cartItems.map((item) => {
            const meta_data: Array<{ key: string; value: string }> = [];

            if (item.discountReason) {
              meta_data.push(
                { key: "_discount_reason", value: item.discountReason },
                { key: "_retail_price", value: item.retailPrice.toString() },
                { key: "_discount_amount", value: (item.retailPrice - item.finalPrice).toString() }
              );
            }

            if (item.surchargeAmount && item.surchargeAmount > 0) {
              meta_data.push(
                { key: "_surcharge_amount", value: item.surchargeAmount.toString() },
                { key: "_surcharge_reason", value: item.surchargeReason || 'Upgrade' }
              );
            }

            meta_data.push({ key: "_final_price", value: item.finalPrice.toString() });

            if (item.bundle) {
              meta_data.push(
                { key: "_is_bundle", value: "true" },
                { key: "_bundle_display_name", value: item.name },
                { key: "_bundle_base_product_name", value: item.bundle.baseProductName },
                { key: "_bundle_mandatory", value: JSON.stringify(item.bundle.selectedMandatory) },
                { key: "_bundle_optional", value: JSON.stringify(item.bundle.selectedOptional) }
              );

              if (item.components) {
                meta_data.push(
                  { key: "_bundle_components", value: JSON.stringify(item.components) }
                );
              }
            }

            return {
              product_id: item.productId,
              quantity: item.quantity,
              subtotal: (item.finalPrice * item.quantity).toString(),
              total: (item.finalPrice * item.quantity).toString(),
              meta_data,
            };
          }),
          meta_data: orderMetaData.length > 0 ? orderMetaData : [],
          voucher_code: voucher?.code || null,
          order_total_override: voucher ? finalTotal : undefined,
          billing: {
            first_name: "Walk-in Customer",
            email: "pos@coffee-oasis.com.my",
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to create order");
      }

      if (voucher) {
        fetch("/api/vouchers/use", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: voucher.code }),
        }).catch(() => {});
      }

      setOrder(data.order);

      await fetch('/api/cart/current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setPendingOrder: true,
          orderId: data.order.id,
          items: cartItems,
        }),
      });
    } catch (err: any) {
      console.error("Order creation error:", err);
      setError(err.message);
      setPaymentMethod(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    clearCart();

    await fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cart: [],
        setPendingOrder: false,
      }),
    });

    router.push("/admin/pos");
  };

  const handleCancel = async () => {
    await fetch('/api/cart/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setPendingOrder: false,
      }),
    });

    setOrder(null);
    setPaymentMethod(null);
    setError(null);
  };

  useEffect(() => {
    if (cartItems.length === 0 && !order) {
      router.push("/admin/pos");
    }
  }, [cartItems, order, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-700">Creating order...</p>
        </div>
      </div>
    );
  }

  if (order && paymentMethod) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <CashPayment
          orderID={order.id}
          amount={finalTotal.toFixed(2)}
          paymentMethod={paymentMethod}
          onSuccess={handlePaymentSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Select Payment Method</h1>
        <p className="text-gray-600 mb-6">How will the customer pay?</p>

        {/* Order Summary */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-500 mb-1">Order Total</p>
          {hasDiscount && (
            <p className="text-lg text-gray-400 line-through">RM {retailTotal.toFixed(2)}</p>
          )}
          <p className="text-3xl font-bold text-gray-900">RM {finalTotal.toFixed(2)}</p>
          {itemDiscount > 0 && (
            <p className="text-sm text-green-600 font-medium mt-1">
              Item discounts: -RM {itemDiscount.toFixed(2)}
            </p>
          )}
          {voucher && (
            <p className="text-sm text-purple-600 font-medium mt-1">
              Voucher ({voucher.code}): -RM {voucherAmount.toFixed(2)}
            </p>
          )}
          <p className="text-sm text-gray-600 mt-2">{cartItems.length} item(s)</p>
        </div>

        {/* Voucher Section */}
        {voucher ? (
          <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg p-3 mb-6">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-purple-600" />
              <div>
                <p className="text-sm font-semibold text-purple-800">{voucher.code}</p>
                <p className="text-xs text-purple-600">
                  {voucher.type === 'fixed' ? `RM ${voucher.discount_value.toFixed(2)} off` : `${voucher.discount_value}% off`}
                </p>
              </div>
            </div>
            <button onClick={() => setVoucher(null)} className="p-1 hover:bg-purple-100 rounded">
              <X className="w-4 h-4 text-purple-600" />
            </button>
          </div>
        ) : (
          <div className="mb-6">
            <p className="text-xs text-gray-400 text-center">Scan a voucher QR code to apply discount</p>
            {voucherError && (
              <p className="text-xs text-red-500 text-center mt-1">{voucherError}</p>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Payment Method Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => handlePaymentMethodSelect("cash")}
            className="w-full p-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">💵</span>
              <div className="text-left">
                <p className="font-semibold">Cash Payment</p>
                <p className="text-sm text-green-100">Accept cash and give change</p>
              </div>
            </span>
            <span className="text-2xl">→</span>
          </button>

          <button
            onClick={() => handlePaymentMethodSelect("bank_qr")}
            className="w-full p-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <span className="text-2xl">📱</span>
              <div className="text-left">
                <p className="font-semibold">Bank QR Code</p>
                <p className="text-sm text-blue-100">Customer scans your QR</p>
              </div>
            </span>
            <span className="text-2xl">→</span>
          </button>
        </div>

        {/* Back Button */}
        <button
          onClick={() => router.push("/admin/pos")}
          className="w-full mt-6 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          ← Back to POS
        </button>
      </div>
    </div>
  );
}
